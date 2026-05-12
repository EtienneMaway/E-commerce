'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useT } from '../../lib/i18n';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState(opts);
    });
  }, []);

  const handle = useCallback((result: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (resolver) resolver(result);
  }, []);

  const onCancel = useCallback(() => handle(false), [handle]);
  const onConfirm = useCallback(() => handle(true), [handle]);

  // Close on Escape, confirm on Enter
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onCancel, onConfirm]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog state={state} onCancel={onCancel} onConfirm={onConfirm} />
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ConfirmOptions | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const open = !!state;

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const palette = useMemo(() => {
    if (state?.variant === 'danger') {
      return {
        accent: '#EF4444',
        accentSoft: 'rgba(239,68,68,0.12)',
        accentBorder: 'rgba(239,68,68,0.35)',
        ring: 'rgba(239,68,68,0.35)',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ),
      };
    }
    return {
      accent: '#6366F1',
      accentSoft: 'rgba(99,102,241,0.12)',
      accentBorder: 'rgba(99,102,241,0.35)',
      ring: 'rgba(99,102,241,0.35)',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    };
  }, [state?.variant]);

  if (!state) return null;

  const confirmLabel = state.confirmLabel ?? 'Confirm';
  const cancelLabel = state.cancelLabel ?? t.common.cancel;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: `0 20px 60px -10px rgba(0,0,0,0.5), 0 0 0 1px ${palette.accentBorder}`,
        }}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: palette.accentSoft, color: palette.accent }}
            >
              {palette.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="confirm-title"
                className="text-base font-bold leading-snug"
                style={{ color: 'var(--foreground)' }}
              >
                {state.title}
              </h2>
              {state.description && (
                <p
                  className="text-sm mt-2 leading-relaxed"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {state.description}
                </p>
              )}
            </div>
          </div>
        </div>
        <div
          className="px-6 py-3 flex justify-end gap-2"
          style={{
            background: 'var(--input)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{
              background: palette.accent,
              boxShadow: `0 1px 0 0 rgba(0,0,0,0.05), 0 4px 12px -2px ${palette.ring}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
