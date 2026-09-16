'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  organizationsApi,
  shopsApi,
  usersApi,
  type Organization,
  type OwnershipHistoryEntry,
  type Shop,
} from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useT } from '../../../../lib/i18n';
import { usePageAccess } from '../../../../hooks/use-page-access';
import { useToast } from '../../../../components/ui/Toast';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';
import { formatDate, getErrorMessage } from '../../../../lib/utils';

/**
 * Hidden for now, deliberately — not deleted.
 *
 * `SHOW_LOGO_URL`: the field takes a raw URL the merchant has to host
 * themselves, which is not something to ask of them. It comes back as an upload
 * once there is a CDN to put the file on.
 *
 * `SHOW_OWNERSHIP_TRANSFER`: handing the business over is built and tested on
 * the API, but parked until it is wanted in the UI.
 *
 * Both are `false` here only — the endpoints stay live, so an existing logo
 * still renders on the crest and a transfer already in flight can still be
 * accepted from the offers card above.
 */
const SHOW_LOGO_URL = false;
const SHOW_OWNERSHIP_TRANSFER = false;

/** Two letters for the crest when no logo is set. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 min-w-0"
      style={{ background: 'rgba(var(--sidebar-fg-rgb),0.06)' }}
    >
      <div className="text-xl font-bold leading-none" style={{ color: 'var(--sidebar-fg)' }}>
        {value}
      </div>
      <div
        className="text-[11px] mt-1 uppercase tracking-wider truncate"
        style={{ color: 'rgba(var(--sidebar-fg-rgb),0.55)' }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * The business, and the branches it trades from.
 *
 * Labelled "Business", never "organization" — a small trader should not have to
 * learn a word from the schema to rename their shop.
 *
 * The page is built as a crest (who you are) followed by the branches, then the
 * two irreversible things — handing the business over, and the record of it
 * having happened before — kept apart at the bottom so they are never adjacent
 * to a save button someone is using in a hurry.
 */
export default function BusinessSettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const allowed = usePageAccess('shops.manage');

  const { data: org } = useQuery({
    queryKey: QK.organization,
    queryFn: organizationsApi.mine,
    enabled: allowed,
  });
  const { data: shops = [] } = useQuery({
    queryKey: QK.shops,
    queryFn: shopsApi.list,
    enabled: allowed,
  });
  const { data: offers = [] } = useQuery({
    queryKey: QK.organizationOffers,
    queryFn: organizationsApi.offers,
  });
  const { data: history = [] } = useQuery({
    queryKey: QK.ownershipHistory,
    queryFn: organizationsApi.history,
    enabled: allowed,
    retry: false,
  });

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: QK.shops });
    void qc.invalidateQueries({ queryKey: QK.organization });
    void qc.invalidateQueries({ queryKey: QK.me });
  };

  const fail = (e: unknown): void =>
    toast({ title: getErrorMessage(e), variant: 'error' });

  // ── business details ─────────────────────────────────────────────────────
  const [details, setDetails] = useState<Partial<Organization>>({});
  useEffect(() => {
    if (org) setDetails({ name: org.name, taxId: org.taxId, logoUrl: org.logoUrl });
  }, [org]);

  const saveOrg = useMutation({
    mutationFn: () => organizationsApi.update(details),
    onSuccess: () => {
      toast({ title: t.shops.saved, variant: 'success' });
      refresh();
    },
    onError: fail,
  });

  // ── branches ─────────────────────────────────────────────────────────────
  const [newBranch, setNewBranch] = useState({ name: '', address: '', city: '' });
  const addBranch = useMutation({
    mutationFn: () =>
      shopsApi.create({
        name: newBranch.name.trim(),
        address: newBranch.address.trim() || undefined,
        city: newBranch.city.trim() || undefined,
      }),
    onSuccess: () => {
      setNewBranch({ name: '', address: '', city: '' });
      toast({ title: t.shops.saved, variant: 'success' });
      refresh();
    },
    onError: fail,
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'default' | 'archive' | 'unarchive' | 'delete' }) =>
      action === 'default'
        ? shopsApi.setDefault(id).then(() => undefined)
        : action === 'archive'
          ? shopsApi.archive(id).then(() => undefined)
          : action === 'unarchive'
            ? shopsApi.unarchive(id).then(() => undefined)
            : shopsApi.remove(id),
    onSuccess: () => {
      toast({ title: t.shops.saved, variant: 'success' });
      refresh();
    },
    onError: fail,
  });

  // ── ownership transfer ───────────────────────────────────────────────────
  const [nominee, setNominee] = useState('');
  const [nomineeQuery, setNomineeQuery] = useState('');
  const { data: candidates = [] } = useQuery({
    queryKey: ['users', 'search', nomineeQuery],
    queryFn: () => usersApi.search(nomineeQuery),
    enabled: nomineeQuery.trim().length >= 2,
  });

  const transfer = useMutation({
    mutationFn: () => organizationsApi.proposeTransfer({ newOwnerUserId: nominee }),
    onSuccess: () => {
      setNominee('');
      setNomineeQuery('');
      toast({ title: t.shops.saved, variant: 'success' });
      refresh();
    },
    onError: fail,
  });
  const cancelTransfer = useMutation({
    mutationFn: organizationsApi.cancelTransfer,
    onSuccess: refresh,
    onError: fail,
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept
        ? organizationsApi.acceptOffer(id).then(() => undefined)
        : organizationsApi.rejectOffer(id),
    onSuccess: () => {
      toast({ title: t.shops.saved, variant: 'success' });
      void qc.invalidateQueries({ queryKey: QK.organizationOffers });
      refresh();
    },
    onError: fail,
  });

  if (!allowed) return null;

  const openBranches = shops.filter((s) => !s.archivedAt);
  const closedBranches = shops.filter((s) => s.archivedAt);
  const founded = history.find((h: OwnershipHistoryEntry) => h.fromUserId === null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.shops.manageTitle}</h1>
          <p className="page-sub">{t.shops.manageSubtitle}</p>
        </div>
      </div>

      <div className="page-content space-y-6" style={{ maxWidth: '900px' }}>
        {/* Offers land at the top: someone is waiting on an answer. */}
        {offers.length > 0 && (
          <section
            className="card p-5 anim-fade-up"
            style={{
              background: 'var(--card)',
              border: '1px solid rgba(var(--primary-rgb),0.35)',
              boxShadow: '0 0 20px rgba(var(--primary-rgb),0.10)',
            }}
          >
            <h2 className="font-bold text-sm mb-3">{t.shops.offersTitle}</h2>
            {offers.map((o: Organization) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{ background: 'var(--surface)' }}
              >
                <span className="font-semibold">{o.name}</span>
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => respond.mutate({ id: o.id, accept: true })}
                  >
                    {t.shops.offerAccept}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => respond.mutate({ id: o.id, accept: false })}
                  >
                    {t.shops.offerReject}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── crest: the business itself ── */}
        <section
          className="card anim-fade-up overflow-hidden"
          style={{ background: 'var(--card)', padding: 0 }}
        >
          <div
            className="px-6 py-6 flex flex-wrap items-center gap-5"
            style={{ background: 'var(--sidebar)' }}
          >
            {/* Logo, or the initials standing in for one. A background-image
                rather than an <img>, so a dead URL degrades to the crest
                instead of a broken-image icon. */}
            <div
              className="flex-shrink-0 rounded-2xl flex items-center justify-center text-xl font-bold"
              style={{
                width: 72,
                height: 72,
                color: '#fff',
                background: details.logoUrl
                  ? `center/cover no-repeat url(${JSON.stringify(details.logoUrl)}), var(--brand-gradient)`
                  : 'var(--brand-gradient)',
                boxShadow: '0 6px 20px rgba(var(--primary-rgb),0.45)',
              }}
            >
              {!details.logoUrl && initials(details.name ?? org?.name ?? '')}
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="text-2xl font-bold tracking-tight truncate"
                style={{ color: 'var(--sidebar-fg)' }}
              >
                {details.name || org?.name || '—'}
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: 'rgba(var(--sidebar-fg-rgb),0.55)' }}
              >
                {founded
                  ? `${t.shops.founder} · ${formatDate(founded.transferredAt)}`
                  : t.shops.detailsSub}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <StatTile value={shops.length} label={t.shops.statBranches} />
              <StatTile value={openBranches.length} label={t.shops.statOpen} />
              <StatTile value={closedBranches.length} label={t.shops.statClosed} />
            </div>
          </div>

          <div className="p-6">
            <h2 className="font-bold text-sm mb-1">{t.shops.business}</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              {t.shops.detailsSub}
            </p>
            <div className={`grid gap-3 ${SHOW_LOGO_URL ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <label className="text-sm">
                <span className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  {t.shops.businessName}
                </span>
                <input
                  className="input w-full"
                  value={details.name ?? ''}
                  onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <span className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  {t.shops.taxId}
                </span>
                <input
                  className="input w-full"
                  value={details.taxId ?? ''}
                  onChange={(e) => setDetails((d) => ({ ...d, taxId: e.target.value }))}
                />
              </label>
              {SHOW_LOGO_URL && (
                <label className="text-sm">
                  <span className="block mb-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    {t.shops.logoUrl}
                  </span>
                  <input
                    className="input w-full"
                    value={details.logoUrl ?? ''}
                    onChange={(e) => setDetails((d) => ({ ...d, logoUrl: e.target.value }))}
                  />
                </label>
              )}
            </div>
            <button
              className="btn btn-primary mt-4"
              disabled={saveOrg.isPending || !details.name?.trim()}
              onClick={() => saveOrg.mutate()}
            >
              {t.shops.saveBusiness}
            </button>
          </div>
        </section>

        {/* ── the rate is a business-wide setting, so it is named here and
               edited where it lives ── */}
        <Link
          href="/settings"
          className="card anim-fade-up delay-1 flex items-center gap-3 px-5 py-4 transition-colors"
          style={{ background: 'var(--card)' }}
        >
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
            style={{ background: 'rgba(var(--primary-rgb),0.12)', color: 'var(--primary)' }}
            aria-hidden
          >
            $
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>
              {t.shops.rateNote}
            </span>
            <span className="block text-sm font-semibold mt-0.5" style={{ color: 'var(--primary)' }}>
              {t.shops.rateLink} →
            </span>
          </span>
        </Link>

        {/* ── branches ── */}
        <section className="card p-6 anim-fade-up delay-2" style={{ background: 'var(--card)' }}>
          <h2 className="font-bold text-sm mb-1">{t.shops.branches}</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            {t.shops.branchesSub}
          </p>

          {shops.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
              {t.shops.noBranchesYet}
            </p>
          ) : (
            <div className="space-y-2">
              {shops.map((s: Shop) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors"
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${s.isDefault ? 'rgba(var(--primary-rgb),0.35)' : 'var(--border)'}`,
                    opacity: s.archivedAt ? 0.72 : 1,
                  }}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: s.isDefault
                          ? 'rgba(var(--primary-rgb),0.14)'
                          : 'rgba(127,127,127,0.12)',
                        color: s.isDefault ? 'var(--primary)' : 'var(--muted)',
                      }}
                      aria-hidden
                    >
                      {initials(s.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                        <span className="truncate">{s.name}</span>
                        {s.isDefault && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                            style={{
                              background: 'rgba(var(--primary-rgb), 0.12)',
                              color: 'var(--primary)',
                            }}
                            title={t.shops.defaultHint}
                          >
                            {t.shops.defaultBranch}
                          </span>
                        )}
                        {s.archivedAt && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                            style={{
                              background: 'rgba(var(--warning-rgb), 0.15)',
                              color: 'var(--warning)',
                            }}
                            title={t.shops.closedHint}
                          >
                            {t.shops.closed}
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {[s.address, s.city].filter(Boolean).join(' · ') ||
                          (s.isDefault ? t.shops.defaultHint : '—')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!s.isDefault && !s.archivedAt && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => act.mutate({ id: s.id, action: 'default' })}
                      >
                        {t.shops.makeDefault}
                      </button>
                    )}
                    {s.archivedAt ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => act.mutate({ id: s.id, action: 'unarchive' })}
                      >
                        {t.shops.reopenBranch}
                      </button>
                    ) : (
                      !s.isDefault && (
                        <button
                          className="btn btn-secondary"
                          onClick={async () => {
                            if (await confirm({ title: t.shops.closeBranch, description: t.shops.closedHint })) {
                              act.mutate({ id: s.id, action: 'archive' });
                            }
                          }}
                        >
                          {t.shops.closeBranch}
                        </button>
                      )
                    )}
                    {!s.isDefault && (
                      <button
                        className="btn btn-danger"
                        title={t.shops.deleteHint}
                        onClick={async () => {
                          if (await confirm({ title: t.shops.deleteBranch, description: t.shops.deleteHint, variant: 'danger' })) {
                            act.mutate({ id: s.id, action: 'delete' });
                          }
                        }}
                      >
                        {t.shops.deleteBranch}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add a branch — dashed, so it reads as the row that isn't one yet. */}
          <div
            className="mt-4 rounded-xl p-4"
            style={{ border: '1px dashed var(--border)', background: 'transparent' }}
          >
            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--muted)' }}>
              {t.shops.newBranchTitle}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <input
                className="input"
                placeholder={t.shops.branchName}
                value={newBranch.name}
                onChange={(e) => setNewBranch((b) => ({ ...b, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder={t.shops.address}
                value={newBranch.address}
                onChange={(e) => setNewBranch((b) => ({ ...b, address: e.target.value }))}
              />
              <input
                className="input"
                placeholder={t.shops.city}
                value={newBranch.city}
                onChange={(e) => setNewBranch((b) => ({ ...b, city: e.target.value }))}
              />
              <button
                className="btn btn-primary"
                disabled={!newBranch.name.trim() || addBranch.isPending}
                onClick={() => addBranch.mutate()}
              >
                {t.shops.addBranch}
              </button>
            </div>
          </div>
        </section>

        {/* ── ownership transfer: last, and visibly separate ── */}
        {SHOW_OWNERSHIP_TRANSFER && (
        <section
          className="card p-6 anim-fade-up delay-3"
          style={{
            background: 'var(--card)',
            border: '1px solid rgba(var(--danger-rgb),0.30)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="rounded-full flex-shrink-0"
              style={{ width: 8, height: 8, background: 'var(--danger)' }}
              aria-hidden
            />
            <h2 className="font-bold text-sm" style={{ color: 'var(--danger)' }}>
              {t.shops.transferTitle}
            </h2>
          </div>
          <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
            {t.shops.transferBody}
          </p>

          {org?.pendingOwnerUserId ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ background: 'var(--danger-light)' }}
            >
              <span className="text-sm font-medium">{t.shops.transferPending('')}</span>
              <button className="btn btn-secondary" onClick={() => cancelTransfer.mutate()}>
                {t.shops.transferCancel}
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="input sm:col-span-2"
                placeholder={t.shops.transferNominee}
                value={nomineeQuery}
                onChange={(e) => {
                  setNomineeQuery(e.target.value);
                  setNominee('');
                }}
              />
              <button
                className="btn btn-danger"
                disabled={!nominee || transfer.isPending}
                onClick={() => transfer.mutate()}
              >
                {t.shops.transferSend}
              </button>
              {candidates.length > 0 && !nominee && (
                <div className="sm:col-span-3 flex flex-wrap gap-2">
                  {candidates.map((c: { id: string; username: string }) => (
                    <button
                      key={c.id}
                      className="btn btn-secondary"
                      onClick={() => {
                        setNominee(c.id);
                        setNomineeQuery(c.username);
                      }}
                    >
                      @{c.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* The record of hand-overs. Dates only — the API returns user ids,
              and a raw uuid on screen is noise, not information. */}
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              {t.shops.ownershipHistory}
            </div>
            {history.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.shops.transferNoneYet}
              </p>
            ) : (
              <ol className="space-y-2">
                {history.map((h: OwnershipHistoryEntry) => (
                  <li key={h.id} className="flex items-center gap-3 text-xs">
                    <span
                      className="rounded-full flex-shrink-0"
                      style={{
                        width: 6,
                        height: 6,
                        background: h.fromUserId === null ? 'var(--primary)' : 'var(--muted)',
                      }}
                      aria-hidden
                    />
                    <span style={{ color: 'var(--foreground)' }}>
                      {h.fromUserId === null ? t.shops.founder : t.shops.transferTitle}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>{formatDate(h.transferredAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
        )}
      </div>
    </>
  );
}
