'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, custodyApi, inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { getErrorMessage } from '../../../lib/utils';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';

/** What `/inventory/products` returns, trimmed to what this picker needs. */
interface ProductSummary {
  productName: string;
  totalAvailable: number;
  kind?: 'simple' | 'group';
  variants?: { variantId: string; label: string; available: number }[];
}

/** One sendable thing: a simple product, or one size of a sized product. */
interface PickOption {
  key: string;
  productName: string;
  variantId: string | null;
  label: string;
  available: number;
}

interface Line {
  key: string;
  quantity: string;
}

interface Props {
  /** True for the owner (sends off the unassigned shelf); false for the custodian (their volume). */
  isOwner: boolean;
  onClose: () => void;
}

const EMPTY_LINE: Line = { key: '', quantity: '' };

export default function SendTransferDialog({ isOwner, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [toShopId, setToShopId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data: destinations } = useQuery({
    queryKey: QK.branchDestinations,
    queryFn: branchTransfersApi.destinations,
  });

  // The owner sends off the branch's shelf; a custodian sends out of the
  // volume they are in charge of, which is exactly what the API draws from.
  const { data: products } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    enabled: isOwner,
  });
  const { data: mine } = useQuery({
    queryKey: QK.custodyMine,
    queryFn: custodyApi.mine,
    enabled: !isOwner,
  });

  const options = useMemo((): PickOption[] => {
    if (!isOwner) {
      return (mine?.lines ?? [])
        .filter((l) => l.quantityRemaining > 0)
        .map((l) => ({
          key: l.variantId ?? l.productName,
          productName: l.productName,
          variantId: l.variantId,
          label: l.variantLabel ? `${l.productName} — ${l.variantLabel}` : l.productName,
          available: l.quantityRemaining,
        }));
    }
    const out: PickOption[] = [];
    for (const p of (products as ProductSummary[] | undefined) ?? []) {
      if (p.kind === 'group' && p.variants?.length) {
        for (const v of p.variants) {
          if (v.available <= 0) continue;
          out.push({
            key: v.variantId,
            productName: p.productName,
            variantId: v.variantId,
            label: `${p.productName} — ${v.label}`,
            available: v.available,
          });
        }
      } else if (p.totalAvailable > 0) {
        out.push({
          key: p.productName,
          productName: p.productName,
          variantId: null,
          label: p.productName,
          available: p.totalAvailable,
        });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [isOwner, mine, products]);

  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);
  const totalUnits = lines.reduce((n, l) => n + (parseInt(l.quantity, 10) || 0), 0);
  const toName = destinations?.find((d) => d.shopId === toShopId)?.name ?? '';

  const send = useMutation({
    mutationFn: () =>
      branchTransfersApi.send({
        toShopId,
        items: lines
          .filter((l) => l.key && parseInt(l.quantity, 10) > 0)
          .map((l) => {
            const o = byKey.get(l.key)!;
            return {
              productName: o.productName,
              quantity: parseInt(l.quantity, 10),
              ...(o.variantId ? { variantId: o.variantId } : {}),
            };
          }),
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
    if (!toShopId) return setError(t.branchTransfers.errDestination);
    const filled = lines.filter((l) => l.key && parseInt(l.quantity, 10) > 0);
    if (filled.length === 0) return setError(t.branchTransfers.errLines);
    const seen = new Set<string>();
    for (const l of filled) {
      const o = byKey.get(l.key);
      if (!o) return setError(t.branchTransfers.errLines);
      if (seen.has(l.key)) return setError(t.branchTransfers.errDuplicate(o.label));
      seen.add(l.key);
      if (parseInt(l.quantity, 10) > o.available) {
        return setError(t.branchTransfers.errTooMany(o.label, o.available));
      }
    }
    setError('');
    send.mutate();
  };

  const setLine = (i: number, patch: Partial<Line>): void => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    if (error) setError('');
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
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 shadow-xl overflow-y-auto border"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)', maxHeight: '90vh' }}
      >
        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
          {t.branchTransfers.sendTitle}
        </h2>
        <p className="text-xs mt-1 mb-5" style={{ color: 'var(--muted)' }}>
          {t.branchTransfers.sendSub}
          {!isOwner && <> {t.branchTransfers.sendFromVolume}</>}
        </p>

        <div className="space-y-4">
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

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_96px_auto] gap-2 text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
              <span>{t.branchTransfers.product}</span>
              <span>{t.branchTransfers.quantity}</span>
              <span />
            </div>
            {lines.map((line, i) => {
              const picked = byKey.get(line.key);
              return (
                <div key={i} className="grid grid-cols-[1fr_96px_auto] gap-2 items-start">
                  <div>
                    <select className="input" value={line.key} onChange={(e) => setLine(i, { key: e.target.value })}>
                      <option value="">{t.branchTransfers.pickProduct}</option>
                      {options.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {picked && (
                      <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                        {t.branchTransfers.available(picked.available)}
                      </p>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    max={picked?.available}
                    className="input tabular-nums"
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    aria-label={t.branchTransfers.removeLine}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-xs font-semibold"
                style={{ color: 'var(--primary)' }}
                onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
              >
                {t.branchTransfers.addLine}
              </button>
              {totalUnits > 0 && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t.branchTransfers.totalUnits(totalUnits)}
                </span>
              )}
            </div>
          </div>

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
    </div>
  );
}
