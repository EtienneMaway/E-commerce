'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ACTIVITY_LOG_TYPES,
  ActivityLogEntry,
  ActivityLogType,
  ActivityLogsParams,
  activityLogsApi,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useFormatCurrency } from '../../../lib/currency';
import { useT, type Translations } from '../../../lib/i18n';
import {
  ACTOR_FILTER_ALL,
  ActorFilter,
  resolveActorFilter,
} from '../../../components/ui/ActorFilter';
import { useAuthStore } from '../../../store/auth.store';
import { usePersonaStore } from '../../../store/persona.store';

const PAGE_SIZE = 50;

type ResourceType = ActivityLogEntry['resourceType'];

const TYPE_COLORS: Record<ActivityLogType, { bg: string; fg: string }> = {
  SALE: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  CONSIGNMENT: { bg: 'rgba(59,130,246,0.15)', fg: '#3B82F6' },
  EXTERNAL_PRODUCT_OUT: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  EXTERNAL_PAYMENT_IN: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  EXTERNAL_PRODUCT_IN: { bg: 'rgba(99,102,241,0.15)', fg: '#818CF8' },
  EXTERNAL_PAYMENT_OUT: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  PAYMENT_TO_SUPPLIER: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  PAYMENT_FROM_DEBTOR: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  EXPENSE: { bg: 'rgba(245,158,11,0.18)', fg: '#F59E0B' },
  INVENTORY_PERSONAL_ADDED: { bg: 'rgba(99,102,241,0.15)', fg: '#818CF8' },
  INVENTORY_RECEIVED_FROM_SUPPLIER: { bg: 'rgba(99,102,241,0.15)', fg: '#818CF8' },
};

function buildDrillLink(entry: ActivityLogEntry): string | null {
  const r: ResourceType = entry.resourceType;
  switch (r) {
    case 'sale':
      return entry.productName
        ? `/inventory/${encodeURIComponent(entry.productName)}`
        : '/sales';
    case 'consignment_item':
      return '/consignments';
    case 'external_transaction':
      return `/external-contacts/${entry.resourceId}`;
    case 'payment':
      return entry.type === 'PAYMENT_TO_SUPPLIER' ? '/suppliers' : '/debtors';
    case 'expense':
      return '/expenses';
    case 'inventory_entry':
      return entry.productName
        ? `/inventory/${encodeURIComponent(entry.productName)}`
        : '/inventory';
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function typeLabel(type: ActivityLogType, t: Translations): string {
  const map = t.activity as unknown as Record<string, string>;
  return map[`type${type}`] ?? type;
}

export default function ActivityPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const { user } = useAuthStore();
  const personaKind = usePersonaStore((s) => s.kind);

  const [selectedTypes, setSelectedTypes] = useState<Set<ActivityLogType>>(new Set());
  const [actorFilter, setActorFilter] = useState<string>(ACTOR_FILTER_ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo<ActivityLogsParams>(() => {
    const p: ActivityLogsParams = { page, limit: PAGE_SIZE };
    if (selectedTypes.size > 0) p.actionTypes = Array.from(selectedTypes);
    const actorId = resolveActorFilter(actorFilter);
    if (actorId) p.actorId = actorId;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [selectedTypes, actorFilter, from, to, page]);

  const { data, isLoading } = useQuery({
    queryKey: QK.activityLogs(params),
    queryFn: () => activityLogsApi.list(params),
  });

  const list = data?.data ?? [];
  const total = data?.total ?? 0;
  const byType = data?.byType ?? {};
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // When `actor` is null, the action was performed by the effective owner
  // themselves: that's the employer when the viewer is acting as an employee,
  // otherwise the viewer's own account.
  const ownerUsername =
    user?.activeEmployment?.employer.username ?? user?.username ?? '';
  const ownerId = user?.activeEmployment?.employer.id ?? user?.id ?? '';

  function toggleType(type: ActivityLogType) {
    setPage(1);
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function resetFilters() {
    setSelectedTypes(new Set());
    setActorFilter(ACTOR_FILTER_ALL);
    setFrom('');
    setTo('');
    setPage(1);
  }

  const inputCls = 'px-3 py-2 rounded-lg text-sm border outline-none';
  const inputStyle = {
    background: 'var(--input)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  } as const;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.activity.title}</h1>
          <p className="page-sub">{t.activity.sub}</p>
          <p
            className="text-[11px] mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={
              personaKind === 'employer'
                ? { background: 'rgba(99,102,241,0.15)', color: '#A5B4FC' }
                : { background: 'rgba(127,127,127,0.12)', color: 'var(--muted)' }
            }
          >
            <span aria-hidden>{personaKind === 'employer' ? '🪪' : '👤'}</span>
            {personaKind === 'employer' && user?.activeEmployment
              ? t.persona.scopeEmployer(user.activeEmployment.employer.username)
              : t.persona.scopeOwn}
          </p>
        </div>
      </div>

      <div className="page-content space-y-6">
        {/* ── Totals + breakdown ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card" style={{ padding: '20px 24px' }}>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--muted)' }}
            >
              {t.activity.totalLabel}
            </p>
            <p
              className="text-2xl font-bold tracking-tight mt-2"
              style={{ color: 'var(--foreground)' }}
            >
              {total}
            </p>
          </div>
          <div className="card lg:col-span-2" style={{ padding: '20px 24px' }}>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--muted)' }}
            >
              {t.activity.breakdownLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACTIVITY_LOG_TYPES.map((type) => {
                const count = byType[type] ?? 0;
                if (count === 0) return null;
                const c = TYPE_COLORS[type];
                return (
                  <span
                    key={type}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {typeLabel(type, t)}
                    <span
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(0,0,0,0.18)', color: c.fg }}
                    >
                      {count}
                    </span>
                  </span>
                );
              })}
              {Object.keys(byType).length === 0 && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>—</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Filters ────────────────────────────────────────────────── */}
        <div className="card" style={{ padding: '16px' }}>
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--muted)' }}
            >
              {t.activity.filters}
            </span>
            <button
              onClick={resetFilters}
              className="text-xs font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              {t.activity.filterReset}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center mb-3">
            {ACTIVITY_LOG_TYPES.map((type) => {
              const active = selectedTypes.has(type);
              const c = TYPE_COLORS[type];
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    background: active ? c.bg : 'transparent',
                    color: active ? c.fg : 'var(--muted)',
                    border: `1px solid ${active ? c.fg : 'var(--border)'}`,
                  }}
                >
                  {typeLabel(type, t)}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.activity.filterFrom}
              </span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setPage(1);
                  setFrom(e.target.value);
                }}
                className={inputCls}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12, width: 'auto' }}
              />
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.activity.filterTo}
              </span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setPage(1);
                  setTo(e.target.value);
                }}
                className={inputCls}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12, width: 'auto' }}
              />
            </div>
            <ActorFilter
              value={actorFilter}
              onChange={(v) => {
                setPage(1);
                setActorFilter(v);
              }}
              className="ml-auto"
            />
          </div>
        </div>

        {/* ── List ───────────────────────────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="data-table-head-row">
                  <th className="data-table-head-cell">{t.activity.colTime}</th>
                  <th className="data-table-head-cell">{t.activity.colType}</th>
                  <th className="data-table-head-cell">{t.activity.colSummary}</th>
                  <th className="data-table-head-cell">{t.activity.colAmount}</th>
                  <th className="data-table-head-cell">{t.activity.colActor}</th>
                  <th className="data-table-head-cell" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: 'var(--muted)' }}
                    >
                      {t.common.loading}
                    </td>
                  </tr>
                )}
                {!isLoading && list.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: 'var(--muted)' }}
                    >
                      <div className="text-2xl mb-2">📊</div>
                      {t.activity.empty}
                    </td>
                  </tr>
                )}
                {list.map((row, i) => {
                  const c = TYPE_COLORS[row.type];
                  const link = buildDrillLink(row);
                  return (
                    <tr
                      key={row.id}
                      className="data-table-row"
                      style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--surface)' }}
                    >
                      <td
                        className="data-table-cell"
                        style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}
                      >
                        {formatTime(row.timestamp)}
                      </td>
                      <td className="data-table-cell">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: c.bg, color: c.fg }}
                        >
                          {typeLabel(row.type, t)}
                        </span>
                      </td>
                      <td className="data-table-cell" style={{ color: 'var(--foreground)' }}>
                        {row.summary}
                      </td>
                      <td className="data-table-cell font-semibold" style={{ whiteSpace: 'nowrap' }}>
                        {row.amount ? formatCurrency(row.amount) : '—'}
                      </td>
                      <td className="data-table-cell">
                        {(() => {
                          const actorId = row.actor?.id ?? ownerId;
                          const actorName = row.actor?.username ?? ownerUsername;
                          const isViewer = actorId === user?.id;
                          return (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
                              style={
                                isViewer
                                  ? { background: 'rgba(127,127,127,0.12)', color: 'var(--foreground)' }
                                  : { background: 'rgba(99,102,241,0.15)', color: '#818CF8' }
                              }
                            >
                              @{actorName || '—'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="data-table-cell text-right">
                        {link && (
                          <Link
                            href={link}
                            className="text-xs font-semibold"
                            style={{ color: 'var(--primary)' }}
                          >
                            {t.activity.drillIn} →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ─────────────────────────────────────────── */}
          {total > PAGE_SIZE && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.activity.page(page, totalPages)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background: page <= 1 ? 'transparent' : 'var(--primary-light)',
                    color: page <= 1 ? 'var(--muted)' : 'var(--primary)',
                    border: '1px solid var(--border)',
                    opacity: page <= 1 ? 0.5 : 1,
                  }}
                >
                  ←
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background: page >= totalPages ? 'transparent' : 'var(--primary-light)',
                    color: page >= totalPages ? 'var(--muted)' : 'var(--primary)',
                    border: '1px solid var(--border)',
                    opacity: page >= totalPages ? 0.5 : 1,
                  }}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
