'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY = { productName: '', unitCost: '', sellingPrice: '', quantity: '', category: '', piecesPerCarton: '' };

export function AddPersonalProductDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.addPersonal({
        productName: form.productName.trim(),
        unitCost: form.unitCost,
        sellingPrice: form.sellingPrice,
        quantity: Number(form.quantity),
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
        ...(form.piecesPerCarton ? { piecesPerCarton: Number(form.piecesPerCarton) } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setForm(EMPTY);
      setError('');
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 shadow-xl overflow-y-auto" style={{ background: 'var(--card)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{t.addProduct.title}</h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        <div className="space-y-4">
          <Field label={t.addProduct.productName}>
            <input value={form.productName} onChange={set('productName')} placeholder={t.addProduct.productNamePlaceholder} className={inputCls} style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.addProduct.unitCost}>
              <input value={form.unitCost} onChange={set('unitCost')} placeholder={t.addProduct.pricePlaceholder} type="number" min="0" step="0.01" className={inputCls} style={inputStyle} />
            </Field>
            <Field label={t.addProduct.sellingPrice}>
              <input value={form.sellingPrice} onChange={set('sellingPrice')} placeholder={t.addProduct.pricePlaceholder} type="number" min="0" step="0.01" className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.addProduct.quantity}>
              <input value={form.quantity} onChange={set('quantity')} placeholder={t.addProduct.qtyPlaceholder} type="number" min="1" className={inputCls} style={inputStyle} />
            </Field>
            <Field label={t.addProduct.category}>
              <input value={form.category} onChange={set('category')} placeholder={t.addProduct.categoryPlaceholder} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label={t.addProduct.piecesPerCarton}>
            <input value={form.piecesPerCarton} onChange={set('piecesPerCarton')} placeholder={t.addProduct.piecesPerCartonPlaceholder} type="number" min="1" className={inputCls} style={inputStyle} />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn btn-secondary flex-1">{t.common.cancel}</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.productName || !form.unitCost || !form.sellingPrice || !form.quantity}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.addProduct.submitting : t.addProduct.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'input';
const inputStyle = {};
