import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import type { Response } from 'express';
import { SyncService, type InboxSignal } from './sync.service';
import type { ActorContext } from '../common/types/actor-context';

/** Response header carrying the caller's current inbox stamps. */
export const INBOX_SIGNAL_HEADER = 'X-Inbox-Signal';

/**
 * How long a computed signal is reused for a given user before recomputing.
 *
 * Without this, every request pays for the signal query — including hot paths
 * like recording a sale. With it, a user hammering the API costs at most one
 * extra query per window, and the header is at worst this stale. That is still
 * an order of magnitude fresher than the poll it supplements, and the poll is
 * the backstop for anything missed.
 */
const MEMO_TTL_MS = 5_000;

/**
 * Attaches the caller's inbox stamps to every authenticated response, so a
 * client that is already talking to the API learns about new events without
 * spending a request on it. `GET /sync/signal` remains the explicit path for
 * idle clients; this makes an active client almost never need it.
 *
 * Deliberately fail-open: any error here is swallowed and the response goes out
 * without the header. The client's poll covers it, and a signalling optimisation
 * must never be able to fail a real request.
 */
@Injectable()
export class InboxSignalInterceptor implements NestInterceptor {
  /** Per-instance memo. Not shared across replicas — it only bounds freshness,
   *  never correctness, so a per-instance view is fine. */
  private readonly memo = new Map<
    string,
    { at: number; signal: InboxSignal }
  >();

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
      // `next.handle()` is Observable<any>; annotating here keeps the response
      // body opaque rather than letting `any` leak through the pipe.
      switchMap((body: unknown) =>
        from(
          this.resolve(actorId)
            .then((signal) => {
              const res = http.getResponse<Response>();
              // Headers are unsettable once the response has begun streaming.
              if (!res.headersSent) {
                res.setHeader(INBOX_SIGNAL_HEADER, JSON.stringify(signal));
              }
            })
            .catch(() => undefined)
            .then(() => body),
        ),
      ),
    );
  }

  /** Memoised signal read. Prunes on access — the map only holds active users. */
  private async resolve(actorId: string): Promise<InboxSignal> {
    const now = Date.now();
    const hit = this.memo.get(actorId);
    if (hit && now - hit.at < MEMO_TTL_MS) return hit.signal;

    const signal = await this.syncService.getSignal(actorId);
    this.memo.set(actorId, { at: now, signal });

    // Bound the map: drop anything past its TTL whenever we recompute. Cheap at
    // this scale and avoids an unbounded map on a long-lived process.
    for (const [key, value] of this.memo) {
      if (now - value.at >= MEMO_TTL_MS) this.memo.delete(key);
    }
    return signal;
  }
}
