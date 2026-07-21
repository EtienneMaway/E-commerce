import type { QueryClient } from '@tanstack/react-query';
import { api, syncApi, type InboxSignal } from './api';
import { QK } from './query-keys';

/**
 * Server-driven inbox refresh for the dashboard — the desktop counterpart of
 * the mobile app's lib/inbox-signal.ts, against the same `GET /sync/signal`
 * endpoint and `X-Inbox-Signal` response header.
 *
 * What it replaces: fixed `refetchInterval`s on the consignments-incoming query
 * and the two mini-handover queries on the employee detail page. Those polled
 * every 15–45s whether or not anything had changed. Here the server reports one
 * cheap epoch-ms stamp per channel and the client refetches a channel only when
 * its stamp moves.
 *
 * Three things feed it, covering the three ways an owner uses the dashboard:
 *   1. `X-Inbox-Signal`, attached to every authenticated response — so while
 *      the owner is clicking around, new events are noticed with no extra
 *      request.
 *   2. `refetchOnWindowFocus` (see providers.tsx) covers alt-tabbing back.
 *   3. A slow poll of `/sync/signal` for the genuinely idle case: a shop screen
 *      left open on the employee page, waiting for a handover to come in, that
 *      never loses focus and issues no other requests. Neither (1) nor (2) fire
 *      then; this does.
 */

export type InboxChannel = keyof InboxSignal;

/**
 * Which React Query keys each channel owns. Keep in sync with the CHANNELS
 * constant in the API's sync.service.ts.
 *
 * Only channels the dashboard actually renders are wired: an owner sees
 * incoming handovers and consignments. `employment` and `salary` have no live
 * dashboard view that polls, so a stamp move there invalidates nothing — but
 * they are still read and tracked, so if such a view is added later it only
 * needs an entry here.
 */
const CHANNEL_KEYS: Record<InboxChannel, ReadonlyArray<readonly unknown[]>> = {
  handovers: [QK.miniSettlementsIncoming, QK.miniActivityAll],
  consignments: [QK.consignmentsIncoming, QK.consignmentsOutgoing],
  employment: [],
  salary: [],
};

const EMPTY_SIGNAL: InboxSignal = {
  handovers: 0,
  employment: 0,
  consignments: 0,
  salary: 0,
};

/** Poll cadence for the idle case. The header piggyback and focus-refetch cover
 *  the active cases, so this only has to catch a screen left untouched. */
export const SIGNAL_POLL_MS = 60_000;

/** Last stamps acted on. Module-level so the axios interceptor (outside React)
 *  can reach it without a store round trip. */
let lastSeen: InboxSignal = { ...EMPTY_SIGNAL };

/** Set once at app start; lets the interceptor invalidate without prop drilling. */
let client: QueryClient | null = null;

/**
 * Compare an incoming signal against what was last acted on and invalidate only
 * the channels that moved. Strictly `>`, never `!==`: an out-of-order stale
 * response carries an older stamp, and treating that as a change would loop.
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

/** Read the piggybacked header off any response. Malformed values are ignored —
 *  this is an optimisation and the poll is the backstop. */
function readSignalHeader(headers: unknown): void {
  // Axios lowercases header names; AxiosHeaders exposes them via indexing.
  const raw = (headers as Record<string, unknown> | undefined)?.['x-inbox-signal'];
  if (typeof raw !== 'string') return;

  try {
    applySignal(JSON.parse(raw) as Partial<InboxSignal>);
  } catch {
    // A garbled header must never break a real response.
  }
}

/** Explicit fetch, for the idle poll. */
export async function fetchInboxSignal(): Promise<void> {
  try {
    applySignal(await syncApi.signal());
  } catch {
    // Offline or auth-expired — the next successful request carries the header.
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
 * Wire the response interceptor. Call once at app start with the QueryClient.
 * Returns a teardown that removes the interceptor.
 */
export function initInboxSignal(queryClient: QueryClient): () => void {
  client = queryClient;

  const id = api.interceptors.response.use(
    (response) => {
      readSignalHeader(response.headers);
      return response;
    },
    (error: unknown) => {
      // Error responses carry the header too.
      const headers = (error as { response?: { headers?: unknown } })?.response?.headers;
      if (headers) readSignalHeader(headers);
      return Promise.reject(error as Error);
    },
  );

  return () => {
    api.interceptors.response.eject(id);
    client = null;
  };
}
