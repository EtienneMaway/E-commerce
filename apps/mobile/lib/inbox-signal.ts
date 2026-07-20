import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { QK } from './query-keys';

/**
 * Server-driven inbox refresh, replacing the four 45s polls this app used to
 * run (see the deleted lib/polling.ts).
 *
 * The old model: every mini employee's device woke up every 45 seconds and
 * fired four separate requests — pending payslips, employment invites, incoming
 * consignments, outgoing handovers — each hitting joins on the API, for events
 * that happen a handful of times a day. On the 2G/3G links these merchants use,
 * that is real data and battery spent on responses that are ~99% "nothing
 * changed".
 *
 * The new model: the server reports one cheap epoch-ms stamp per channel. The
 * client refetches a channel only when its stamp moves. Two things deliver it:
 *
 *   1. The `X-Inbox-Signal` header, attached to every authenticated response.
 *      While the merchant is actually using the app, new events are noticed
 *      with ZERO extra requests.
 *   2. `GET /sync/signal`, polled slowly, for the idle case where nothing else
 *      is talking to the API. One tiny request instead of four heavy ones.
 *
 * Plus a one-shot check when the app returns to the foreground, so a device
 * that was backgrounded for an hour catches up immediately rather than waiting
 * out a poll interval.
 */

export interface InboxSignal {
  handovers: number;
  employment: number;
  consignments: number;
  salary: number;
}

export type InboxChannel = keyof InboxSignal;

/**
 * Which React Query keys each channel owns.
 *
 * Per-channel rather than one global stamp precisely so a payslip event does
 * not cause a mini to refetch consignments. Keep this in sync with the CHANNELS
 * constant in the API's sync.service.ts — that is the only coupling between the
 * two sides.
 */
const CHANNEL_KEYS: Record<InboxChannel, ReadonlyArray<readonly unknown[]>> = {
  handovers: [QK.miniSettlementsOutgoing, QK.miniBalance],
  employment: [QK.employments()],
  consignments: [QK.consignmentsIncoming],
  salary: [QK.salaryPaymentsPending, QK.salaryHistory],
};

const EMPTY_SIGNAL: InboxSignal = {
  handovers: 0,
  employment: 0,
  consignments: 0,
  salary: 0,
};

/**
 * Poll cadence for the idle case. Longer than the 45s it replaces: the header
 * piggyback covers any user who is actually doing something, so this only has
 * to catch the "app open, screen untouched" case, and one tiny request a minute
 * is cheaper than four heavy ones every 45 seconds.
 */
export const SIGNAL_POLL_MS = 60_000;

/** Last stamps we have acted on. Module-level so the axios interceptor — which
 *  is not inside React — can reach it without a store round trip. */
let lastSeen: InboxSignal = { ...EMPTY_SIGNAL };

/** Set once at app start; lets the interceptor invalidate without prop drilling. */
let client: QueryClient | null = null;

/**
 * Compare an incoming signal against what we last acted on and invalidate only
 * the channels that moved.
 *
 * Strictly `>`, never `!==`: a stale response arriving out of order (very
 * possible on a slow link) carries an older stamp, and treating that as a
 * change would invalidate in a loop.
 */
function applySignal(signal: Partial<InboxSignal>): void {
  if (!client) return;

  for (const channel of Object.keys(CHANNEL_KEYS) as InboxChannel[]) {
    const incoming = signal[channel];
    if (typeof incoming !== 'number' || incoming <= lastSeen[channel]) continue;

    lastSeen[channel] = incoming;
    for (const queryKey of CHANNEL_KEYS[channel]) {
      void client.invalidateQueries({ queryKey });
    }
  }
}

/**
 * Read the piggybacked header off any response. Malformed values are ignored
 * rather than thrown — this is an optimisation, and the poll is the backstop.
 */
function readSignalHeader(headers: unknown): void {
  const raw = (headers as Record<string, unknown> | undefined)?.[
    'x-inbox-signal'
  ];
  if (typeof raw !== 'string') return;

  try {
    applySignal(JSON.parse(raw) as Partial<InboxSignal>);
  } catch {
    // Ignore: a garbled header must never break a real response.
  }
}

/** Explicit fetch, for the idle poll and the foreground catch-up. */
export async function fetchInboxSignal(): Promise<void> {
  try {
    const { data } = await api.get<InboxSignal>('/sync/signal');
    applySignal(data);
  } catch {
    // Offline or auth-expired. Nothing to do — the next successful request
    // carries the header anyway.
  }
}

/**
 * Reset to a clean slate. Called on login and logout: stamps are per-user, so
 * carrying one user's high-water marks into the next session would suppress the
 * new user's first real invalidation.
 */
export function resetInboxSignal(): void {
  lastSeen = { ...EMPTY_SIGNAL };
}

/**
 * Wire the response interceptor. Call once, at app start, with the app's
 * QueryClient. Returns a teardown that removes the interceptor.
 */
export function initInboxSignal(queryClient: QueryClient): () => void {
  client = queryClient;

  const id = api.interceptors.response.use(
    (response) => {
      readSignalHeader(response.headers);
      return response;
    },
    (error: unknown) => {
      // Error responses carry the header too — a 422 price-guard warning is
      // still a round trip we can learn from.
      const headers = (error as { response?: { headers?: unknown } })?.response
        ?.headers;
      if (headers) readSignalHeader(headers);
      return Promise.reject(error);
    },
  );

  return () => {
    api.interceptors.response.eject(id);
    client = null;
  };
}
