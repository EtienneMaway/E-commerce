'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { externalContactsApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useFormatCurrency } from '../../../lib/currency';
import { useT } from '../../../lib/i18n';

type RoleFilter = 'ALL' | 'DEBTOR' | 'SUPPLIER';
type Role = 'DEBTOR' | 'SUPPLIER' | 'BOTH';

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  role: Role;
  debtorBalance: string;
  supplierBalance: string;
  createdAt: string;
}

interface CreateForm {
  name: string;
  phone: string;
  notes: string;
  role: Role;
}

export default function ExternalContactsPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RoleFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>({ name: '', phone: '', notes: '', role: 'DEBTOR' });

  const { data, isLoading } = useQuery({
    queryKey: QK.externalContacts,
    queryFn: () => externalContactsApi.list(),
    staleTime: 30_000,
  });

  const contacts = (data as Contact[] | undefined) ?? [];

  const createMutation = useMutation({
    mutationFn: () => externalContactsApi.create({
      name: form.name,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      role: form.role,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      setForm({ name: '', phone: '', notes: '', role: 'DEBTOR' });
      setShowCreate(false);
    },
  });

  const filtered = contacts.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'DEBTOR') return c.role === 'DEBTOR' || c.role === 'BOTH';
    return c.role === 'SUPPLIER' || c.role === 'BOTH';
  });

  const roleLabel: Record<Role, string> = {
    DEBTOR: t.externalContacts.roleDebtor,
    SUPPLIER: t.externalContacts.roleSupplier,
    BOTH: t.externalContacts.roleBoth,
  };

  const filterTabs: { key: RoleFilter; label: string }[] = [
    { key: 'ALL', label: t.externalContacts.filterAll },
    { key: 'DEBTOR', label: t.externalContacts.roleDebtor },
    { key: 'SUPPLIER', label: t.externalContacts.roleSupplier },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            {t.nav.externalContacts}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {t.externalContacts.sub}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          {t.externalContacts.addContact}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit" style={{ background: 'var(--muted)' }}>
        {filterTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: filter === key ? 'var(--card)' : 'transparent',
              color: filter === key ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👤</div>
          <p className="font-semibold" style={{ color: 'var(--foreground)' }}>{t.externalContacts.emptyTitle}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.emptyDesc}</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colName}</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colPhone}</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colRole}</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colOwesYou}</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colYouOwe}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/external-contacts/${c.id}`}
                      className="font-medium hover:underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                    >
                      {roleLabel[c.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--success)' }}>
                    {formatCurrency(c.debtorBalance)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--danger)' }}>
                    {formatCurrency(c.supplierBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--foreground)' }}>{t.externalContacts.newContactTitle}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.fieldNameRequired}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t.externalContacts.placeholderName}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.fieldPhoneOptional}</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder={t.externalContacts.placeholderPhone}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.fieldNotesOptional}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t.externalContacts.placeholderNotes}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.fieldRole}</label>
                <div className="flex gap-2">
                  {(['DEBTOR', 'SUPPLIER', 'BOTH'] as Role[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setForm((f) => ({ ...f, role: r }))}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all"
                      style={{
                        background: form.role === r ? 'var(--primary)' : 'var(--muted)',
                        color: form.role === r ? '#fff' : 'var(--muted-foreground)',
                        borderColor: form.role === r ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      {roleLabel[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
              >
                {t.externalContacts.cancel}
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.name.trim() || createMutation.isPending}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--primary)' }}
              >
                {createMutation.isPending ? t.externalContacts.creating : t.externalContacts.create}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
