'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, custodyApi, inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { getErrorMessage } from '../../../lib/utils';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';
import ProductPickerPopup from './ProductPickerPopup';
import {
  emptyPick,
  fromProductList,
  fromVolumeLines,
  hasCartons,
  maxCartons,
  maxWholePieces,
  resolvePick,
  splitCartons,
  type PickIssue,
  type PickProduct,
  type PickState,
} from '../../../lib/transfer-pick';

interface Props {
  /** True for the owner (sends off the unassigned shelf); false for the custodian (their volume). */
  isOwner: boolean;
  onClose: () => void;
}

type T = ReturnType<typeof useT>;

function issueText(t: T, issue: PickIssue): string {
  const b = t.branchTransfers;
  switch (issue.kind) {
    case 'empty':
      return issue.size ? b.issueEmptySize(issue.size) : b.issueEmpty;
    case 'noSizes':
      return b.issueNoSizes;
    case 'tooManyPieces':
      return issue.size ? b.issueTooManyPiecesSize(issue.size, issue.max) : b.issueTooManyPieces(issue.max);
    case 'tooManyCartons':
      return b.issueTooManyCartons(issue.max);
    case 'tooManyCombined':
      return b.issueTooManyCombined(issue.size, issue.max);
  }
}

/** Digits only — quantity fields never take signs or decimals. */
const digits = (v: string): string => v.replace(/[^0-9]/g, '');

export default function SendTransferDialog({ isOwner, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [toShopId, setToShopId] = useState('');
  /** Ticked products in the order they were ticked, with their quantities. */
  const [picks, setPicks] = useState<{ key: string; state: PickState }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  /** Empty-quantity errors only show once they tried to send; over-stock errors show at once. */
  const [tried, setTried] = useState(false);

  const { data: destinations } = useQuery({
    queryKey: QK.branchDestinations,
    queryFn: branchTransfersApi.destinations,
  });

  // The owner sends off the branch's shelf; a custodian sends out of the
  // volume they are in charge of, which is exactly what the API draws from.
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    enabled: isOwner,
  });
  const { data: mine, isLoading: mineLoading } = useQuery({
    queryKey: QK.custodyMine,
    queryFn: custodyApi.mine,
    enabled: !isOwner,
  });

  const catalog = useMemo(
    (): PickProduct[] => (isOwner ? fromProductList(products ?? []) : fromVolumeLines(mine?.lines ?? [])),
    [isOwner, mine, products],
  );
  const byKey = useMemo(() => new Map(catalog.map((p) => [p.key, p])), [catalog]);

  // Products that left the stock list (sold meanwhile) drop out of the selection.
  const rows = picks
    .map((pk) => ({ ...pk, product: byKey.get(pk.key) }))
    .filter((r): r is typeof r & { product: PickProduct } => !!r.product)
    .map((r) => ({ ...r, resolved: resolvePick(r.product, r.state) }));
  const totalUnits = rows.reduce((n, r) => n + r.resolved.units, 0);
  const toName = destinations?.find((d) => d.shopId === toShopId)?.name ?? '';
  const picked = new Set(picks.map((p) => p.key));

  /** Apply the popup's selection: keep typed quantities of products still picked. */
  const applyPicker = (keys: string[]): void => {
    setPicks((ps) => {
      const keep = ps.filter((p) => keys.includes(p.key));
      const added = keys.filter((k) => !ps.some((p) => p.key === k)).map((key) => ({ key, state: emptyPick() }));
      return [...keep, ...added];
    });
    setPickerOpen(false);
    if (error) setError('');
  };

  const toggle = (key: string): void => {
    setPicks((ps) => (ps.some((p) => p.key === key) ? ps.filter((p) => p.key !== key) : [...ps, { key, state: emptyPick() }]));
    if (error) setError('');
  };
  const patch = (key: string, next: Partial<PickState>): void => {
    setPicks((ps) => ps.map((p) => (p.key === key ? { ...p, state: { ...p.state, ...next } } : p)));
    if (error) setError('');
  };

  const send = useMutation({
    mutationFn: () =>
      branchTransfersApi.send({
        toShopId,
        items: rows.flatMap((r) => r.resolved.items),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.custodyMine });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast({ variant: 'success', title: t.branchTransfers.toastSentTitle, description: t.branchTransfers.toastSentBody(toName) });
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const submit = (): void => {
    setTried(true);
    if (!toShopId) return setError(t.branchTransfers.errDestination);
    if (rows.length === 0) return setError(t.branchTransfers.errLines);
    if (rows.some((r) => r.resolved.issue)) return setError(t.branchTransfers.errFix);
    setError('');
    send.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl p-6 shadow-xl overflow-y-auto border"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)', maxHeight: '92vh' }}
      >
        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
          {t.branchTransfers.sendTitle}
        </h2>
        <p className="text-xs mt-1 mb-5" style={{ color: 'var(--muted)' }}>
          {t.branchTransfers.sendSub}
          {!isOwner && <> {t.branchTransfers.sendFromVolume}</>}
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.destination}
            </label>
            {destinations && destinations.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {t.branchTransfers.noDestinations}
              </p>
            ) : (
              <select
                className="input"
                value={toShopId}
                onChange={(e) => {
                  setToShopId(e.target.value);
                  if (error) setError('');
                }}
              >
                <option value="">{t.branchTransfers.pickDestination}</option>
                {(destinations ?? []).map((d) => (
                  <option key={d.shopId} value={d.shopId}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Product chooser: opens a searchable, paged popup ─────── */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.pickProducts}
            </label>
            <button
              type="button"
              className="input w-full text-left flex items-center justify-between gap-2"
              onClick={() => setPickerOpen(true)}
              style={picks.length ? { borderColor: 'var(--primary)' } : undefined}
            >
              <span style={{ color: picks.length ? 'var(--foreground)' : 'var(--muted)' }}>
                {picks.length ? t.branchTransfers.changeSelection(picks.length) : t.branchTransfers.chooseProducts}
              </span>
              <span aria-hidden style={{ color: 'var(--muted)' }}>
                ▸
              </span>
            </button>
            {tried && picks.length === 0 && (
              <p className="text-[11px] mt-1 font-semibold" style={{ color: 'var(--danger)' }}>
                {t.branchTransfers.errLines}
              </p>
            )}
          </div>

          {/* ── One card per ticked product ───────────────────────────── */}
          {rows.length > 0 && (
            <div className="space-y-3">
              {rows.map(({ key, product: p, state: s, resolved }) => {
                const issue = resolved.issue;
                // Over-stock shows at once; a missing quantity only after "Send".
                const show = issue && (tried || (issue.kind !== 'empty' && issue.kind !== 'noSizes'));
                return (
                  <div
                    key={key}
                    className="rounded-xl border p-4"
                    style={{ borderColor: show ? 'var(--danger)' : 'var(--border)', background: 'var(--background)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold capitalize" style={{ color: 'var(--foreground)' }}>
                          {p.productName}
                        </p>
                        <ProductHint t={t} p={p} />
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => toggle(key)}
                        aria-label={t.branchTransfers.removeLine}
                      >
                        ✕
                      </button>
                    </div>

                    {p.kind === 'group' && (
                      <div className="inline-flex rounded-lg p-0.5 mt-3" style={{ background: 'var(--surface)' }}>
                        {(['whole', 'split'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => patch(key, { mode: m })}
                            className="px-3 py-1 text-xs font-semibold rounded-md"
                            style={
                              s.mode === m
                                ? { background: 'var(--card)', color: 'var(--foreground)', boxShadow: 'var(--shadow-xs)' }
                                : { color: 'var(--muted)' }
                            }
                          >
                            {m === 'whole' ? t.branchTransfers.modeWhole : t.branchTransfers.modeSplit}
                          </button>
                        ))}
                      </div>
                    )}

                    {p.kind === 'group' && s.mode === 'split' ? (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                          {t.branchTransfers.splitHint}
                        </p>
                        {p.sizes.map((z) => {
                          const on = !!s.sizeOn[z.variantId];
                          return (
                            <div key={z.variantId} className="grid grid-cols-[auto_1fr_110px] items-center gap-3">
                              <input
                                type="checkbox"
                                checked={on}
                                className="h-4 w-4 accent-[var(--primary)]"
                                onChange={() => patch(key, { sizeOn: { ...s.sizeOn, [z.variantId]: !on } })}
                              />
                              <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                                {z.label}{' '}
                                <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                                  · {t.branchTransfers.availPieces(z.available)}
                                </span>
                              </span>
                              <input
                                inputMode="numeric"
                                className="input tabular-nums"
                                placeholder={t.branchTransfers.pieces}
                                disabled={!on}
                                value={s.sizePieces[z.variantId] ?? ''}
                                onChange={(e) =>
                                  patch(key, { sizePieces: { ...s.sizePieces, [z.variantId]: digits(e.target.value) } })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {hasCartons(p) && (
                          <div>
                            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--foreground-secondary)' }}>
                              {t.branchTransfers.cartons}
                            </label>
                            <input
                              inputMode="numeric"
                              className="input tabular-nums"
                              placeholder="0"
                              value={s.cartons}
                              onChange={(e) => patch(key, { cartons: digits(e.target.value) })}
                            />
                          </div>
                        )}
                        <div className={hasCartons(p) ? '' : 'col-span-2 sm:col-span-1'}>
                          <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--foreground-secondary)' }}>
                            {t.branchTransfers.pieces}
                          </label>
                          <input
                            inputMode="numeric"
                            className="input tabular-nums"
                            placeholder="0"
                            value={s.pieces}
                            onChange={(e) => patch(key, { pieces: digits(e.target.value) })}
                          />
                        </div>
                      </div>
                    )}

                    {/* What will actually leave — per size for "all sizes". */}
                    {!issue && resolved.units > 0 && (
                      <p className="text-[11px] mt-2 tabular-nums" style={{ color: 'var(--primary)' }}>
                        {p.kind === 'group' && s.mode === 'whole'
                          ? `${t.branchTransfers.eachGets}: ${resolved.items
                              .map((it) => `${p.sizes.find((z) => z.variantId === it.variantId)?.label} ${it.quantity}`)
                              .join(' · ')}`
                          : t.branchTransfers.willSend(resolved.units)}
                      </p>
                    )}
                    {show && issue && (
                      <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--danger)' }}>
                        {issueText(t, issue)}
                      </p>
                    )}
                  </div>
                );
              })}
              {totalUnits > 0 && (
                <p className="text-xs text-right" style={{ color: 'var(--muted)' }}>
                  {t.branchTransfers.totalUnits(totalUnits)}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.note}
            </label>
            <input
              className="input"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.branchTransfers.notePlaceholder}
            />
          </div>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn btn-secondary flex-1">
              {t.common.cancel}
            </button>
            <button onClick={submit} disabled={send.isPending} className="btn btn-primary flex-1">
              {send.isPending ? t.branchTransfers.sending : t.branchTransfers.sendSubmit}
            </button>
          </div>
        </div>
      </div>
      {pickerOpen && (
        <ProductPickerPopup
          catalog={catalog}
          loading={isOwner ? productsLoading : mineLoading}
          selected={picked}
          onDone={applyPicker}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/** The availability hint under a product's name. */
function ProductHint({ t, p }: { t: T; p: PickProduct }) {
  const b = t.branchTransfers;
  if (p.kind === 'simple') {
    const asCartons = splitCartons(p.available, p.piecesPerCarton);
    return (
      <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: 'var(--muted)' }}>
        {b.availPieces(p.available)}
        {asCartons && ` ${b.availAsCartons(asCartons.cartons, asCartons.rest)} · ${b.perCarton(p.piecesPerCarton)}`}
      </p>
    );
  }
  const cartons = maxCartons(p);
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1">
        {p.sizes.map((z) => (
          <span
            key={z.variantId}
            className="text-[11px] px-1.5 py-0.5 rounded tabular-nums"
            style={{ background: 'var(--surface)', color: 'var(--foreground-secondary)' }}
          >
            {z.label} {z.available}
            {z.piecesPerCarton > 0 && <span style={{ color: 'var(--muted)' }}> ({z.piecesPerCarton}/ctn)</span>}
          </span>
        ))}
      </div>
      <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
        {b.wholeHint(maxWholePieces(p))}
        {hasCartons(p) && ` · ${b.wholeCartonHint(cartons)}`}
      </p>
    </div>
  );
}
