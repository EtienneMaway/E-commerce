import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { Response } from 'express';
import { SyncService, type InboxSignal } from './sync.service';
import type { ActorContext } from '../common/types/actor-context';

/** Response header carrying the caller's current inbox stamps. */
export const INBOX_SIGNAL_HEADER = 'X-Inbox-Signal';

/**
 * How long a computed signal is reused for a given user before it is refreshed
 * in the background. The header is only ever set from this cache — never from a
 * fresh read — so it is at worst this stale, which the client's poll backstops.
 */
const MEMO_TTL_MS = 5_000;

/**
 * Attaches the caller's inbox stamps to every authenticated response as a
 * best-effort header, so a client already talking to the API often learns about
 * new events without spending a request. `GET /sync/signal` is the reliable
 * channel; this only supplements it.
 *
 * CRITICAL: this must never add latency to, or fail, a real response. It only
 * ever reads a synchronous in-memory cache; a cold or stale cache means the
 * response simply goes out WITHOUT the header while a single background refresh
 * warms the cache for the next response. An earlier version awaited the signal
 * query inline, which gated EVERY endpoint's response on a DB read — under a
 * dashboard's ~10 concurrent cold-cache requests that serialised into visible
 * slowness across all pages. Never reintroduce an `await` on the response path.
 */
@Injectable()
export class InboxSignalInterceptor implements NestInterceptor {
  /** Per-instance cache. Not shared across replicas — it only bounds freshness,
   *  never correctness, so a per-instance view is fine. */
  private readonly memo = new Map<
    string,
    { at: number; signal: InboxSignal }
  >();

  /** Actors with a background refresh in flight — collapses the thundering herd
   *  when many concurrent requests all find a cold cache. */
  private readonly refreshing = new Set<string>();

  constructor(private readonly syncService: SyncService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      actorContext?: ActorContext;
      path?: string;
    }>();
    const actorId = req.actorContext?.actorId;

    // Unauthenticated routes have no inbox. The signal endpoint itself returns
    // the payload in its body — no point duplicating it into a header.
    if (!actorId || req.path?.endsWith('/sync/signal')) {
      return next.handle();
    }

    return next.handle().pipe(
      // Synchronous only — no `await`, no `from(promise)`. The body passes
      // straight through; the header is attached from cache if warm, otherwise
      // a background refresh is kicked off and this response goes out bare.
      map((body: unknown) => {
        const cached = this.cachedSignal(actorId);
        if (cached) {
          const res = http.getResponse<Response>();
          // Headers are unsettable once the response has begun streaming.
          if (!res.headersSent) {
            res.setHeader(INBOX_SIGNAL_HEADER, JSON.stringify(cached));
          }
        } else {
          // Fire-and-forget: not awaited, not tied to this response.
          this.refreshInBackground(actorId);
        }
        return body;
      }),
    );
  }

  /** The cached signal if still fresh, else null. Pure in-memory; never hits the
   *  DB, so it is safe on the response path. */
  private cachedSignal(actorId: string): InboxSignal | null {
    const hit = this.memo.get(actorId);
    if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.signal;
    return null;
  }

  /** Warm the cache off the response path. At most one refresh per actor runs at
   *  a time; errors are swallowed (fail-open). */
  private refreshInBackground(actorId: string): void {
    if (this.refreshing.has(actorId)) return;
    this.refreshing.add(actorId);
    void this.syncService
      .getSignal(actorId)
      .then((signal) => {
        const now = Date.now();
        this.memo.set(actorId, { at: now, signal });
        // Bound the map: drop expired entries whenever we refresh.
        for (const [key, value] of this.memo) {
          if (now - value.at >= MEMO_TTL_MS) this.memo.delete(key);
        }
      })
      .catch(() => undefined)
      .finally(() => this.refreshing.delete(actorId));
  }
}
