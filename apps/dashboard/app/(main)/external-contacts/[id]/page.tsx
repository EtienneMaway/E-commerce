'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { externalContactsApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useFormatCurrency } from '../../../../lib/currency';
import { useT } from '../../../../lib/i18n';

type TxType = 'PRODUCT_OUT' | 'PAYMENT_IN' | 'PRODUCT_IN' | 'PAYMENT_OUT';
type Role = 'DEBTOR' | 'SUPPLIER' | 'BOTH';
type Modal = 'product-out' | 'payment-in' | 'product-in' | 'payment-out' | null;

interface ExternalTransaction {
  id: string;
  type: TxType;
  productName: string | null;
  quantity: number | null;
  unitPrice: string | null;
  unitCostUsed: string | null;
  amount: string;
  profit: string | null;
  isLoss: boolean | null;
  notes: string | null;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  role: Role;
  debtorBalance: string;
  supplierBalance: string;
  transactions: ExternalTransaction[];
}

function txBadgeColor(type: TxType): string {
  switch (type) {
    case 'PRODUCT_OUT': return 'var(--success)';
    case 'PAYMENT_IN': return 'var(--primary)';
    case 'PRODUCT_IN': return 'var(--warning)';
    case 'PAYMENT_OUT': return 'var(--danger)';
  }
}

function txLabel(type: TxType, productName: string | null, quantity: number | null): string {
  switch (type) {
    case 'PRODUCT_OUT': return `Gave ${quantity}× ${productName}`;
    case 'PAYMENT_IN': return 'Payment received';
    case 'PRODUCT_IN': return `Received ${quantity}× ${productName}`;
    case 'PAYMENT_OUT': return 'Payment made';
  }
}

function ActionModal({ modal, contactId, onClose }: { modal: Modal; contactId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ productName: '', quantity: '', unitPrice: '', unitCost: '', sellingPrice: '', category: '', amount: '', notes: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: QK.externalContactDetail(contactId) });
    qc.invalidateQueries({ queryKey: QK.externalContacts });
    onClose();
  };

  const mut = useMutation({
    mutationFn: () => {
      if (modal === 'product-out') {
        return externalContactsApi.recordProductOut(contactId, {
          productName: form.productName, quantity: parseInt(form.quantity, 10),
          unitPrice: form.unitPrice, notes: form.notes || undefined,
        });
      }
      if (modal === 'payment-in') {
        return externalContactsApi.recordPaymentIn(contactId, { amount: form.amount, notes: form.notes || undefined });
      }
      if (modal === 'product-in') {
        return externalContactsApi.recordProductIn(contactId, {
          productName: form.productName, quantity: parseInt(form.quantity, 10),
          unitCost: form.unitCost, sellingPrice: form.sellingPrice,
          category: form.category || undefined, notes: form.notes || undefined,
        });
      }
      return externalContactsApi.recordPaymentOut(contactId, { amount: form.amount, notes: form.notes || undefined });
    },
    onSuccess,
  });

  const titles: Record<NonNullable<Modal>, string> = {
    'product-out': 'Give Products',
    'payment-in': 'Receive Payment',
    'product-in': 'Receive Products',
    'payment-out': 'Make Payment',
  };

  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--foreground)' }}>{titles[modal]}</h2>
        <div className="space-y-3">
          {(modal === 'product-out' || modal === 'product-in') && (
            <>
              <Field label="Product Name" value={form.productName} onChange={set('productName')} placeholder="e.g. Rice 50kg" />
              <Field label="Quantity" value={form.quantity} onChange={set('quantity')} placeholder="10" type="number" />
            </>
          )}
          {modal === 'product-out' && (
            <Field label="Unit Price (they owe you)" value={form.unitPrice} onChange={set('unitPrice')} placeholder="28.00" type="number" />
          )}
          {modal === 'product-in' && (
            <>
              <Field label="Unit Cost (you owe per unit)" value={form.unitCost} onChange={set('unitCost')} placeholder="22.00" type="number" />
              <Field label="Your Selling Price" value={form.sellingPrice} onChange={set('sellingPrice')} placeholder="30.00" type="number" />
              <Field label="Category (optional)" value={form.category} onChange={set('category')} placeholder="Grains" />
            </>
          )}
          {(modal === 'payment-in' || modal === 'payment-out') && (
            <Field label="Amount" value={form.amount} onChange={set('amount')} placeholder="0.00" type="number" />
          )}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium border"
            style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {mut.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
        {mut.isError && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--danger)' }}>
            {(mut.error as Error)?.message ?? 'An error occurred'}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
      <input
        value={value} onChange={onChange} placeholder={placeholder} type={type}
        className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
        style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      />
    </div>
  );
}

export default function ExternalContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const t = useT();
  const [openModal, setOpenModal] = useState<Modal>(null);

  const { data, isLoading } = useQuery({
    queryKey: QK.externalContactDetail(id),
    queryFn: () => externalContactsApi.detail(id),
    enabled: !!id,
  });

  const contact = data as Contact | undefined;

  const deleteTxMutation = useMutation({
    mutationFn: (txId: string) => externalContactsApi.deleteTransaction(id, txId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContactDetail(id) });
      qc.invalidateQueries({ queryKey: QK.externalContacts });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: () => externalContactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      router.push('/external-contacts');
    },
  });

  if (isLoading || !contact) {
    return <div className="p-6 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading...</div>;
  }

  const isDebtor = contact.role === 'DEBTOR' || contact.role === 'BOTH';
  const isSupplier = contact.role === 'SUPPLIER' || contact.role === 'BOTH';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
        <Link href="/external-contacts" className="hover:underline" style={{ color: 'var(--primary)' }}>
          {t.nav.externalContacts}
        </Link>
        {' / '}{contact.name}
      </div>

      {/* Contact card */}
      <div className="rounded-2xl p-5 mb-5 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{contact.name}</h1>
            {contact.phone && <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{contact.phone}</p>}
            {contact.notes && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted-foreground)' }}>{contact.notes}</p>}
          </div>
          <button
            onClick={() => { if (confirm('Delete this contact and all transactions?')) deleteContactMutation.mutate(); }}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            Delete
          </button>
        </div>

        {/* Balances */}
        <div className="flex gap-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {isDebtor && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Owes You</p>
              <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatCurrency(contact.debtorBalance)}</p>
            </div>
          )}
          {isSupplier && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>You Owe</p>
              <p className="text-xl font-bold" style={{ color: 'var(--danger)' }}>{formatCurrency(contact.supplierBalance)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {isDebtor && (
          <>
            <button onClick={() => setOpenModal('product-out')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              📦 Give Products
            </button>
            <button onClick={() => setOpenModal('payment-in')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              💵 Receive Payment
            </button>
          </>
        )}
        {isSupplier && (
          <>
            <button onClick={() => setOpenModal('product-in')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              📥 Receive Products
            </button>
            <button onClick={() => setOpenModal('payment-out')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              💸 Make Payment
            </button>
          </>
        )}
      </div>

      {/* Transaction history */}
      <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
        Transaction History ({contact.transactions.length})
      </h2>
      {contact.transactions.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div className="text-4xl mb-2">📋</div>
          <p className="font-medium" style={{ color: 'var(--foreground)' }}>No transactions yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Use the buttons above to record a transaction.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contact.transactions.map((tx) => (
            <div key={tx.id} className="rounded-xl px-4 py-3 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {txLabel(tx.type, tx.productName, tx.quantity)}
                  </p>
                  {tx.type === 'PRODUCT_OUT' && tx.unitPrice && tx.unitCostUsed && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      Cost {formatCurrency(tx.unitCostUsed)} · Sell {formatCurrency(tx.unitPrice)} per unit
                    </p>
                  )}
                  {tx.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{tx.notes}</p>}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-start gap-3 ml-4">
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: txBadgeColor(tx.type) }}>
                      {formatCurrency(tx.amount)}
                    </p>
                    {tx.profit != null && (
                      <p className="text-xs font-medium mt-0.5" style={{ color: tx.isLoss ? 'var(--danger)' : 'var(--success)' }}>
                        {tx.isLoss ? '▼' : '▲'} {formatCurrency(Math.abs(parseFloat(tx.profit)).toFixed(2))} profit
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => { if (confirm('Delete this transaction? Balance will be corrected but inventory changes are not reversed.')) deleteTxMutation.mutate(tx.id); }}
                    className="text-xs px-2 py-1 rounded border mt-0.5"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action modals */}
      <ActionModal modal={openModal} contactId={id} onClose={() => setOpenModal(null)} />
    </div>
  );
}
