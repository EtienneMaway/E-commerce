'use client';

import { useEffect, useState } from 'react';
import { computeSpendRemaining, type SpendRemainingInput } from '../../lib/spend-remaining';
import { useT } from '../../lib/i18n';

interface Props {
  readonly input: SpendRemainingInput;
}

const fcFmt = new Intl.NumberFormat('fr-CD');
const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Left to spend" button and its dialog: the expense headroom in FC and in USD.
 * Closes on the Close button, a click outside, or Escape. Renders nothing when
 * no limit is visible to this account (e.g. a role without the cash overview).
 */
export function SpendRemainingDialog({ input }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const remaining = computeSpendRemaining(input);
  if (!remaining) return null;

  const nothingLeft = remaining.fc <= 0;
  const hint =
    remaining.limitedBy === 'daily' ? t.expenses.spendLeftDailyHint : t.expenses.spendLeftBusinessHint;
  const figureColor = nothingLeft ? 'var(--danger)' : 'var(--foreground)';

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        {t.expenses.spendLeftBtn}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="spend-left-title"
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px -10px rgba(0,0,0,0.5)',
            }}
          >
            <div className="p-6">
              <h2
                id="spend-left-title"
                className="text-base font-bold leading-snug"
                style={{ color: 'var(--foreground)' }}
              >
                {t.expenses.spendLeftTitle}
              </h2>
              {nothingLeft && (
                <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>
                  {t.expenses.spendLeftNone}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                    {t.expenses.spendLeftFcLabel}
                  </p>
                  <p className="text-2xl font-bold tracking-tight mt-1" style={{ color: figureColor }}>
                    {fcFmt.format(remaining.fc)} FC
                  </p>
                </div>
                <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                    {t.expenses.spendLeftUsdLabel}
                  </p>
                  <p className="text-2xl font-bold tracking-tight mt-1" style={{ color: figureColor }}>
                    ${usdFmt.format(remaining.usd)}
                  </p>
                </div>
              </div>

              <p className="text-sm mt-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {hint}
              </p>
            </div>

            <div
              className="px-6 py-3 flex justify-end"
              style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
            >
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)} autoFocus>
                {t.expenses.spendLeftClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
