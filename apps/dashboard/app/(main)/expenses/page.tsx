'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  ExpenseCurrency,
  ExpenseListParams,
  ExpenseListResponse,
  ExpensePeriod,
  dashboardApi,
  expensesApi,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { useT } from '../../../lib/i18n';
import { KpiCard } from '../../../components/ui/KpiCard';

interface CashPosition {
  totalProfit: string;
  totalExpenses: string;
  availableProfitCash: string;
}

type FilterKey = 'all' | 'today' | 'week' | 'month' | 'lastN' | 'custom';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const today = todayISO();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<FilterKey>('month');
  const [nDays, setNDays] = useState(7);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | ''>('');

  // ── Form ──────────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<ExpenseCurrency>('USD');
  const [category, setCategory] = useState<ExpenseCategory>('TRANSPORT');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState('');
  const [overBudgetOpen, setOverBudgetOpen] = useState(false);
  const [overBudgetProjection, setOverBudgetProjection] = useState('0');

  const listParams = useMemo<ExpenseListParams>(() => {
    const p: ExpenseListParams = {};
    if (categoryFilter) p.category = categoryFilter;
    if (filter === 'custom') {
      if (customFrom) p.from = customFrom;
      if (customTo) p.to = customTo;
    } else if (filter === 'lastN') {
      p.period = 'lastNDays';
      p.days = nDays;
    } else if (filter !== 'all') {
      p.period = filter as ExpensePeriod;
    }
    return p;
  }, [filter, nDays, customFrom, customTo, categoryFilter]);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: QK.expenses(listParams),
    queryFn: () => expensesApi.list(listParams),
  });

  const { data: cashData } = useQuery({
    queryKey: QK.cashPosition,
    queryFn: () => dashboardApi.cashPosition(),
  });

  const cash = cashData as CashPosition | undefined;
  const list = (listData as ExpenseListResponse | undefined) ?? {
    data: [],
    totals: { totalAmountUsd: '0.00', byCategory: [], count: 0 },
  };

  const createMutation = useMutation({
    mutationFn: (override: boolean) =>
      expensesApi.create({
        amount,
        currency,
        category,
        description: description.trim() || undefined,
        date: date ? new Date(date).toISOString() : undefined,
      }).then((r) => ({ r, override })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: QK.cashPosition });
      qc.invalidateQueries({ queryKey: QK.withdrawalAvailable });
      setAmount('');
      setDescription('');
      setFormError('');
      setOverBudgetOpen(false);
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: QK.cashPosition });
      qc.invalidateQueries({ queryKey: QK.withdrawalAvailable });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!amount || parseFloat(amount) <= 0) {
      setFormError('Amount must be greater than zero');
      return;
    }
    // Compute projected availableProfitCash — only for USD amounts
    if (cash && currency === 'USD') {
      const projected = parseFloat(cash.availableProfitCash) - parseFloat(amount);
      if (projected < 0) {
        setOverBudgetProjection(projected.toFixed(2));
        setOverBudgetOpen(true);
        return;
      }
    }
    createMutation.mutate(false);
  }

  const categoryLabel = (c: ExpenseCategory): string =>
    (t.expenses as unknown as Record<string, string>)[`cat${c}`] ?? c;

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: 'today', label: t.expenses.filterToday },
    { key: 'week', label: t.expenses.filterWeek },
    { key: 'month', label: t.expenses.filterMonth },
    { key: 'lastN', label: t.expenses.filterLastN.replace('{n}', String(nDays)) },
    { key: 'custom', label: t.expenses.filterCustom },
    { key: 'all', label: t.expenses.filterAll },
  ];

  const labelCls = 'block text-xs font-medium mb-1';
  const labelStyle = { color: 'var(--muted-foreground)' } as const;
  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none';
  const inputStyle = {
    background: 'var(--input)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  } as const;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.expenses.title}</h1>
          <p className="page-sub">{t.expenses.sub}</p>
        </div>
        {cash && (
          <div
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: parseFloat(cash.availableProfitCash) < 0
                ? 'rgba(var(--danger-rgb),0.1)'
                : 'rgba(var(--success-rgb),0.1)',
              color: parseFloat(cash.availableProfitCash) < 0 ? 'var(--danger)' : 'var(--success)',
              border: `1px solid ${parseFloat(cash.availableProfitCash) < 0 ? 'rgba(var(--danger-rgb),0.2)' : 'rgba(var(--success-rgb),0.2)'}`,
            }}
          >
            {t.dashboard.availableProfitCash}: {formatCurrency(cash.availableProfitCash)}
          </div>
        )}
      </div>

      <div className="page-content space-y-6">
        {/* ── Top KPIs ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard
            label={t.dashboard.totalProfit}
            value={formatCurrency(cash?.totalProfit ?? '0')}
            icon="💰"
            color="primary"
            sub={t.dashboard.totalProfitSub}
          />
          <KpiCard
            label={t.dashboard.totalExpenses}
            value={formatCurrency(cash?.totalExpenses ?? '0')}
            icon="🧾"
            color="warning"
            sub={t.dashboard.totalExpensesSub}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: add form ──────────────────────────────────────── */}
        <div className="card" style={{ padding: '24px', height: 'fit-content' }}>
          <h2 className="font-bold text-sm tracking-tight mb-4" style={{ color: 'var(--foreground)' }}>
            {t.expenses.addBtn}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={labelCls} style={labelStyle}>{t.expenses.amount}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${inputCls} flex-1`}
                  style={inputStyle}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <select
                  className={inputCls}
                  style={{ ...inputStyle, maxWidth: 96 }}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as ExpenseCurrency)}
                >
                  <option value="USD">USD</option>
                  <option value="FC">FC</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>{t.expenses.category}</label>
              <select
                className={inputCls}
                style={inputStyle}
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>{t.expenses.date}</label>
              <input
                type="date"
                className={inputCls}
                style={inputStyle}
                value={date}
                max={today}
                onChange={(e) => {
                  const v = e.target.value;
                  setDate(v && v > today ? today : v);
                }}
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>{t.expenses.description}</label>
              <textarea
                className={inputCls}
                style={inputStyle}
                rows={3}
                placeholder={t.expenses.descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {formError && (
              <div className="text-xs" style={{ color: 'var(--danger)' }}>{formError}</div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? t.expenses.submitting : t.expenses.submit}
            </button>
          </form>
        </div>

        {/* ── Right: totals + list ────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card" style={{ padding: '20px 24px' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                {t.expenses.totalLabel}
              </p>
              <p className="text-2xl font-bold tracking-tight mt-2" style={{ color: 'var(--foreground)' }}>
                {formatCurrency(list.totals.totalAmountUsd)}
              </p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                {list.totals.count} {t.expenses.countLabel.toLowerCase()}
              </p>
            </div>
            <div className="card" style={{ padding: '20px 24px' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                {t.expenses.byCategory}
              </p>
              <div className="mt-2 space-y-1 max-h-24 overflow-auto">
                {list.totals.byCategory.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>—</p>
                )}
                {list.totals.byCategory.map((c) => (
                  <div key={c.category} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--muted)' }}>{categoryLabel(c.category)}</span>
                    <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                      {formatCurrency(c.totalUsd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="card" style={{ padding: '16px' }}>
            <div className="flex flex-wrap gap-2 items-center">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background: filter === tab.key ? 'var(--primary-light)' : 'transparent',
                    color: filter === tab.key ? 'var(--primary)' : 'var(--muted)',
                    border: `1px solid ${filter === tab.key ? 'rgba(var(--primary-rgb),0.2)' : 'var(--border)'}`,
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {filter === 'lastN' && (
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={nDays}
                  onChange={(e) => setNDays(Math.max(1, Number(e.target.value) || 1))}
                  className={inputCls}
                  style={{ ...inputStyle, width: 72, padding: '4px 8px', fontSize: 12 }}
                />
              )}
              {filter === 'custom' && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    max={today}
                    onChange={(e) => {
                      const v = e.target.value;
                      const clamped = v && v > today ? today : v;
                      setCustomFrom(clamped);
                      if (clamped && !customTo) setCustomTo(today);
                    }}
                    className={inputCls}
                    style={{ ...inputStyle, padding: '4px 8px', fontSize: 12, width: 'auto' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>→</span>
                  <input
                    type="date"
                    value={customTo}
                    max={today}
                    min={customFrom || undefined}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomTo(v && v > today ? today : v);
                    }}
                    className={inputCls}
                    style={{ ...inputStyle, padding: '4px 8px', fontSize: 12, width: 'auto' }}
                  />
                </>
              )}
              <select
                className={`${inputCls} ml-auto`}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12, width: 'auto' }}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | '')}
              >
                <option value="">{t.expenses.filterCategoryAll}</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* List */}
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ minWidth: 600 }}>
                <thead>
                  <tr className="data-table-head-row">
                    <th className="data-table-head-cell">{t.expenses.colDate}</th>
                    <th className="data-table-head-cell">{t.expenses.colCategory}</th>
                    <th className="data-table-head-cell">{t.expenses.colAmount}</th>
                    <th className="data-table-head-cell">{t.expenses.colDescription}</th>
                    <th className="data-table-head-cell" />
                  </tr>
                </thead>
                <tbody>
                  {listLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                        {t.common.loading}
                      </td>
                    </tr>
                  )}
                  {!listLoading && list.data.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                        <div className="text-2xl mb-2">🧾</div>
                        {t.expenses.listEmpty}
                      </td>
                    </tr>
                  )}
                  {list.data.map((row, i) => (
                    <tr
                      key={row.id}
                      className="data-table-row"
                      style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--surface)' }}
                    >
                      <td className="data-table-cell" style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {formatDate(row.date)}
                      </td>
                      <td className="data-table-cell font-semibold">
                        {categoryLabel(row.category)}
                      </td>
                      <td className="data-table-cell">
                        <div className="font-semibold">{formatCurrency(row.amountUsd)}</div>
                        {row.currency === 'FC' && (
                          <div className="text-xs" style={{ color: 'var(--muted)' }}>
                            {row.amount} FC
                          </div>
                        )}
                      </td>
                      <td className="data-table-cell" style={{ color: 'var(--muted)' }}>
                        {row.description ?? '—'}
                      </td>
                      <td className="data-table-cell text-right">
                        <button
                          onClick={() => {
                            if (confirm(t.expenses.deleteConfirm)) deleteMutation.mutate(row.id);
                          }}
                          className="text-xs font-semibold"
                          style={{ color: 'var(--danger)' }}
                          disabled={deleteMutation.isPending}
                        >
                          {t.expenses.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* ── Over-budget confirm dialog ───────────────────────────── */}
      {overBudgetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOverBudgetOpen(false)}
        >
          <div
            className="card max-w-md w-full"
            style={{ padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base mb-2" style={{ color: 'var(--danger)' }}>
              ⚠️ {t.expenses.overBudgetTitle}
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
              {t.expenses.overBudgetBody(formatCurrency(overBudgetProjection))}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOverBudgetOpen(false)}
                className="btn btn-secondary"
                disabled={createMutation.isPending}
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => createMutation.mutate(true)}
                className="btn btn-danger"
                disabled={createMutation.isPending}
              >
                {t.expenses.overBudgetConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
