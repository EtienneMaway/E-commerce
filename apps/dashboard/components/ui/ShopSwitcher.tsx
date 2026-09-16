'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ALL_SHOPS, useShopStore } from '../../store/shop.store';
import { useT } from '../../lib/i18n';

/**
 * Which branch the dashboard is looking at.
 *
 * **Hidden entirely at one branch.** A merchant with a single shop must not pay
 * any interface cost for a feature they do not use — they should never learn
 * the word "branch" until they open a second one.
 *
 * Switching clears the whole React Query cache. The switch is rare and
 * deliberate, a full refetch is what the user expects, and partial invalidation
 * is impossible to get right: a missed key shows one branch's figures under
 * another's name, which reads as corrupted data rather than a stale cache.
 */
export function ShopSwitcher() {
  const t = useT();
  const qc = useQueryClient();
  const { shopId, shops, organizations, orgId, organization, setShop, setOrg } = useShopStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const active = shops.filter((s) => !s.isArchived);
  const multiOrg = organizations.length > 1;

  // One branch and one business: nothing to switch between.
  if (active.length <= 1 && !multiOrg) return null;

  const current =
    shopId === ALL_SHOPS
      ? t.shops.allShops
      : (shops.find((s) => s.id === shopId)?.name ??
         shops.find((s) => s.isDefault)?.name ??
         active[0]?.name ??
         '');

  const choose = (next: string | null): void => {
    setShop(next);
    qc.clear();
    setOpen(false);
  };

  const chooseOrg = (next: string): void => {
    setOrg(next);
    qc.clear();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden>🏪</span>
          <span className="truncate font-medium" style={{ color: 'var(--foreground)' }}>
            {current}
          </span>
        </span>
        <span style={{ color: 'var(--muted)' }} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden shadow-lg"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {multiOrg && (
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-xs uppercase mb-1" style={{ color: 'var(--muted)' }}>
                {t.shops.business}
              </div>
              {organizations.map((o) => (
                <button
                  key={o.id}
                  onClick={() => chooseOrg(o.id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-sm"
                  style={{
                    background:
                      (orgId ?? organization?.id) === o.id
                        ? 'rgba(var(--primary-rgb), 0.12)'
                        : 'transparent',
                    color: 'var(--foreground)',
                  }}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}

          {active.map((s) => (
            <button
              key={s.id}
              role="option"
              aria-selected={shopId === s.id}
              onClick={() => choose(s.id)}
              className="w-full text-left px-3 py-2 text-sm"
              style={{
                background:
                  shopId === s.id ? 'rgba(var(--primary-rgb), 0.12)' : 'transparent',
                color: 'var(--foreground)',
              }}
            >
              {s.name}
              {s.isDefault && (
                <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {t.shops.defaultBranch}
                </span>
              )}
            </button>
          ))}

          {/* Reading across branches is an owner's view; the API refuses every
              write under it, and the UI disables those controls to match. */}
          <button
            role="option"
            aria-selected={shopId === ALL_SHOPS}
            onClick={() => choose(ALL_SHOPS)}
            className="w-full text-left px-3 py-2 text-sm"
            style={{
              background:
                shopId === ALL_SHOPS ? 'rgba(var(--primary-rgb), 0.12)' : 'transparent',
              color: 'var(--foreground)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {t.shops.allShops}
            <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
              {t.shops.readOnly}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The strip that explains why every write control is disabled.
 *
 * Without it, "All shops" looks broken rather than deliberate — the buttons are
 * simply dead and nothing says why.
 */
export function AllShopsBanner() {
  const t = useT();
  const shopId = useShopStore((s) => s.shopId);
  const shops = useShopStore((s) => s.shops);
  const setShop = useShopStore((s) => s.setShop);
  const qc = useQueryClient();

  if (shopId !== ALL_SHOPS) return null;

  const back = shops.find((s) => s.isDefault) ?? shops[0];

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl px-4 py-2 mb-4 text-sm"
      style={{
        background: 'rgba(var(--warning-rgb), 0.12)',
        border: '1px solid rgba(var(--warning-rgb), 0.35)',
        color: 'var(--foreground)',
      }}
    >
      <span>{t.shops.allShopsNotice}</span>
      {back && (
        <button
          className="btn btn-secondary"
          style={{ padding: '0.25rem 0.75rem' }}
          onClick={() => {
            setShop(back.id);
            qc.clear();
          }}
        >
          {t.shops.pickBranch(back.name)}
        </button>
      )}
    </div>
  );
}
