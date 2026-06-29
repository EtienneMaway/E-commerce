'use client';

import { useT } from '../../lib/i18n';

export type SummaryPeriod = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface PeriodState {
  period: SummaryPeriod;
  from: string; // YYYY-MM-DD, only used when period === 'custom'
  to: string;
}

export const DEFAULT_PERIOD: PeriodState = { period: 'today', from: '', to: '' };

/** Whether the current selection is ready to query (custom needs both dates). */
export function periodReady(s: PeriodState): boolean {
  return s.period !== 'custom' || (!!s.from && !!s.to);
}

/** Build the profit-summary query params from a PeriodState. */
export function periodToParams(s: PeriodState): {
  period?: SummaryPeriod;
  dateFrom?: string;
  dateTo?: string;
} {
  if (s.period === 'custom') return { period: 'custom', dateFrom: s.from, dateTo: s.to };
  return { period: s.period };
}

interface Props {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
  /** Hide the "Custom" chip + date inputs (e.g. tight spaces). */
  allowCustom?: boolean;
}

/**
 * Controlled period selector: Today / Last 7d / Last 30d / All time / Custom.
 * Shared by the dashboard home filter and the SalesProfitWidget so the chip
 * behaviour and labels stay identical.
 */
export function PeriodFilter({ value, onChange, allowCustom = true }: Props) {
  const t = useT();

  const PERIODS: { label: string; value: SummaryPeriod }[] = [
    { label: t.dashboard.periodToday, value: 'today' },
    { label: t.dashboard.periodWeek, value: 'week' },
    { label: t.dashboard.periodMonth, value: 'month' },
    { label: t.dashboard.periodAll, value: 'all' },
    ...(allowCustom ? [{ label: t.dashboard.periodCustom, value: 'custom' as const }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange({ ...value, period: p.value })}
            className={`pill${value.period === p.value ? ' active' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.period === 'custom' && (
        <div className="flex gap-3 flex-wrap items-end">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            {t.dashboard.profitFrom}
            <input
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="input"
              style={{ padding: '6px 10px', fontSize: '13px' }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            {t.dashboard.profitTo}
            <input
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="input"
              style={{ padding: '6px 10px', fontSize: '13px' }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Human label for a period — handy for card subtitles. */
export function usePeriodLabel(): (p: SummaryPeriod) => string {
  const t = useT();
  return (p) =>
    p === 'today'
      ? t.dashboard.periodToday
      : p === 'week'
        ? t.dashboard.periodWeek
        : p === 'month'
          ? t.dashboard.periodMonth
          : p === 'all'
            ? t.dashboard.periodAll
            : t.dashboard.periodCustom;
}
