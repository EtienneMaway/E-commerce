'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { UserSearchInput } from '../ui/UserSearchInput';
import { useT } from '../../lib/i18n';

interface UserOption {
  id: string;
  username: string;
}

interface ItemRow {
  productName: string;
  quantity: string;
  agreedUnitPrice: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY_ITEM: ItemRow = { productName: '', quantity: '', agreedUnitPrice: '' };

export function SendConsignmentDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [debtor, setDebtor] = useState<UserOption | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      consignmentsApi.create({
        debtorUserId: debtor!.id,
        ...(note.trim() ? { note: note.trim() } : {}),
        items: items.map((it) => ({
          productName: it.productName.trim(),
          quantity: Number(it.quantity),
          agreedUnitPrice: it.agreedUnitPrice,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.consignmentsOutgoing });
      setDebtor(null);
      setNote('');
      setItems([{ ...EMPTY_ITEM }]);
      setError('');
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const setItem = (i: number, k: keyof ItemRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, [k]: e.target.value } : row)));

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (i: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const canSubmit =
    debtor &&
    items.length > 0 &&
    items.every((it) => it.productName.trim() && it.quantity && it.agreedUnitPrice);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 shadow-xl overflow-y-auto" style={{ background: 'var(--card)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{t.sendConsignment.title}</h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        <div className="space-y-4">
          <UserSearchInput label={t.sendConsignment.debtor} value={debtor} onChange={setDebtor} placeholder={t.userSearch.placeholder} />

          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{t.sendConsignment.note}</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.sendConsignment.notePlaceholder}
              className="input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{t.sendConsignment.items}</label>
              <button type="button" onClick={addItem} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
                {t.sendConsignment.addItem}
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    value={item.productName}
                    onChange={setItem(i, 'productName')}
                    placeholder={t.sendConsignment.productNamePlaceholder}
                    className={inputCls}
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <input
                    value={item.quantity}
                    onChange={setItem(i, 'quantity')}
                    placeholder={t.sendConsignment.qtyPlaceholder}
                    type="number"
                    min="1"
                    className={inputCls}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    value={item.agreedUnitPrice}
                    onChange={setItem(i, 'agreedUnitPrice')}
                    placeholder={t.sendConsignment.pricePlaceholder}
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="px-2 py-2 rounded-xl text-sm"
                      style={{ color: 'var(--danger)' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn btn-secondary flex-1">{t.common.cancel}</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.sendConsignment.submitting : t.sendConsignment.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'input';
const inputStyle: React.CSSProperties = {};
