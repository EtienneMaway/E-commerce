'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((opts: ToastOptions) => void) | null>(null);

export function useToast(): (opts: ToastOptions) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; fg: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.45)', fg: '#065f46', icon: '✓' },
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.45)', fg: '#7f1d1d', icon: '!' },
  info: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.45)', fg: '#1e3a8a', icon: 'i' },
};

let nextId = 0;

/**
 * Minimal toast system.
 *
 * Added because the write dialogs closed silently on success — the merchant got
 * no confirmation that (say) entrusting products to a mini employee had
 * actually worked, so the natural response was to do it again. For an app that
 * moves stock and money, "did that go through?" must never be a guess.
 *
 * Deliberately tiny and dependency-free: same context shape as ConfirmProvider,
 * so both mount together in the (main) layout.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = nextId++;
    setItems((prev) => [...prev, { ...opts, id }]);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        Top-right, sitting just below the fixed 56px top bar rather than at
        top-4 — the user menu lives in that bar's right corner, and a toast
        overlapping it would cover the controls it sits on top of.
        New toasts append downward so one already being read never shifts.
      */}
      <div
        className="fixed z-[100] top-16 right-4 flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <ToastRow key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const variant = item.variant ?? 'info';
  const style = VARIANT_STYLES[variant];
  // Errors stay until dismissed — they usually need reading and acting on.
  const duration = item.duration ?? (variant === 'error' ? 0 : 5000);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(timer);
  }, [duration, item.id, onDismiss]);

  return (
    <div
      className="pointer-events-auto min-w-[260px] max-w-[380px] rounded-xl px-4 py-3 shadow-lg flex items-start gap-3"
      style={{
        background: 'var(--card, #fff)',
        borderLeft: `4px solid ${style.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: style.bg, color: style.fg }}
        aria-hidden
      >
        {style.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {item.title}
        </p>
        {item.description && (
          <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--muted-foreground, #6b7280)' }}>
            {item.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 text-xs opacity-60 hover:opacity-100"
        style={{ color: 'var(--foreground)' }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
