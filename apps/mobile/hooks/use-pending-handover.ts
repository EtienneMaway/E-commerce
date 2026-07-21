import { useQuery } from '@tanstack/react-query';
import { miniSettlementsApi, type MiniSettlementSummary } from '../lib/api';
import { QK } from '../lib/query-keys';
import { useAuthStore } from '../store/auth.store';

/**
 * A mini is identified by a Sales-only (SALES_ONLY) employment — not the legacy
 * synthetic-account flag — so a normal user who accepted a sales-only invite
 * counts too.
 */
export function useIsMini(): boolean {
  return useAuthStore((s) => s.user?.activeEmployment?.tier === 'SALES_ONLY');
}

export interface PendingHandover {
  /** The handover awaiting the employer's decision, if any. */
  pending: MiniSettlementSummary | null;
  /** Newest handover when it was rejected — nothing else surfaces a rejection. */
  latestRejected: MiniSettlementSummary | null;
  /**
   * While a handover is pending the mini has physically given back both the
   * cash and the unsold goods, so selling and re-handing-over are both off.
   */
  isBlocked: boolean;
  isMini: boolean;
  isLoading: boolean;
}

/**
 * Shared source of truth for "is a handover waiting for approval right now".
 * The API enforces the same rule (a mini cannot record a sale or open a second
 * handover while one is PENDING); this drives the UI so the employee sees the
 * state instead of discovering it through a rejected request.
 */
export function usePendingHandover(): PendingHandover {
  const isMini = useIsMini();
  const { data, isLoading } = useQuery({
    queryKey: QK.miniSettlementsOutgoing,
    queryFn: miniSettlementsApi.outgoing,
    enabled: isMini,
    staleTime: 15_000,
    // No polling: useInboxSignal invalidates this key when the handovers stamp
    // moves, so the employer's approve/reject lands here as soon as the app
    // hears about it rather than up to 45s later.
  });

  const list = (data as MiniSettlementSummary[] | undefined) ?? [];
  const pending = list.find((s) => s.status === 'PENDING') ?? null;
  // Outgoing comes back newest-first; a rejection only matters until the mini
  // submits their next handover, which pushes a new row to the front.
  const newest = list[0] ?? null;
  const latestRejected = newest?.status === 'REJECTED' ? newest : null;

  return { pending, latestRejected, isBlocked: !!pending, isMini, isLoading };
}
