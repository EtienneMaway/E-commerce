'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setBranchChooser } from '../../lib/api';
import { useShopStore, type ShopSummary } from '../../store/shop.store';
import { useT } from '../../lib/i18n';

/**
 * The branch picker that a refused write opens.
 *
 * Mounted once, near the top of the authenticated app. It renders nothing until
 * `lib/api.ts` asks — the interceptor there catches the API's `SHOP_REQUIRED`
 * refusal, calls the chooser this component registers, and replays the request
 * once an answer comes back. So the flow the user sees is: submit a form under
 * "All branches" → "which branch?" → pick → the form completes. No re-typing,
 * and no error toast for something that was only ever an unanswered question.
 *
 * Picking here switches the whole dashboard to that branch, rather than
 * applying to the one request. A branch is a single global selection in this
 * app (`shop.store` → `lib/api.ts` → `X-Shop-Id`), and a per-request exception
 * would leave the header still reading "All branches" while the row just landed
 * somewhere specific — and would ask the same question again on the next write.
 */
export function BranchRequiredDialog() {
  const t = useT();
  const qc = useQueryClient();
  const shops = useShopStore((s) => s.shops);
  const setShop = useShopStore((s) => s.setShop);

  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((shopId: string | null) => void) | null>(null);

  // The chooser is registered once and lives as long as the app does, but it
  // has to read the *current* shop list and act on the *current* store. Refs
  // rather than effect dependencies: re-registering on every shop-list change
  // would swap the chooser out from under a dialog that is already open.
  const shopsRef = useRef<ShopSummary[]>(shops);
  shopsRef.current = shops;

  const applyRef = useRef<(shopId: string) => void>(() => {});
  applyRef.current = (shopId: string) => {
    setShop(shopId);
    // `removeQueries()`, not `queryClient.clear()` as `ShopSwitcher` uses.
    // Same effect on cached reads — every branch-scoped answer is dropped
    // rather than left to be shown under another branch's name — but it leaves
    // the mutation cache alone. We are standing inside a mutation that is about
    // to be retried, and clearing the mutation cache under it is not a risk
    // worth taking for a tidier one-liner.
    qc.removeQueries();
  };

  const finish = useCallback((shopId: string | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    if (shopId) applyRef.current(shopId);
    resolve?.(shopId);
  }, []);

  useEffect(() => {
    setBranchChooser(
      () =>
        new Promise<string | null>((resolve) => {
          // Archived branches are excluded: they read forever but refuse every
          // write, so offering one here trades a 400 for a 409.
          const active = shopsRef.current.filter((s) => !s.isArchived);

          // Nothing to ask. One open branch means there is no choice to
          // present — a modal with a single button is a worse answer than just
          // using it. None at all means the dialog cannot help, so the original
          // refusal should surface.
          if (active.length === 0) return resolve(null);
          if (active.length === 1) {
            applyRef.current(active[0].id);
            return resolve(active[0].id);
          }

          resolverRef.current = resolve;
          setOpen(true);
        }),
    );
    return () => setBranchChooser(null);
  }, []);

  // Escape backs out — same contract as cancelling, so the caller's error
  // handling still runs rather than hanging on an unresolved promise.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const active = shops.filter((s) => !s.isArchived);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) finish(null);
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="branch-required-title"
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.5)',
        }}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(var(--primary-rgb),0.12)',
                color: 'var(--primary)',
              }}
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
              >
                <path d="M3 9l1.5-5h15L21 9" />
                <path d="M4 9v11h16V9" />
                <path d="M3 9h18" />
                <path d="M9 20v-6h6v6" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="branch-required-title"
                className="text-base font-bold leading-snug"
                style={{ color: 'var(--foreground)' }}
              >
                {t.shops.pickForActionTitle}
              </h2>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t.shops.pickForActionBody}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {active.map((s) => (
              <button
                key={s.id}
                onClick={() => finish(s.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                <span className="font-medium">{s.name}</span>
                {s.isDefault && (
                  <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                    {t.shops.defaultBranch}
                  </span>
                )}
                {s.address && (
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {s.address}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div
          className="px-6 py-3 flex justify-end"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={() => finish(null)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
