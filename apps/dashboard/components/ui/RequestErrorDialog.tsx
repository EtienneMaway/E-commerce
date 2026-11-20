'use client';

import { useEffect } from 'react';
import { useT } from '../../lib/i18n';
import {
  EXPENSE_OVER_LIMIT,
  getErrorCode,
  getErrorMessage,
  isNetworkError,
  isTimeoutError,
} from '../../lib/utils';

interface Props {
  /** The failed request's error, or null when closed. */
  readonly error: unknown;
  readonly onClose: () => void;
}

type Kind = 'offline' | 'timeout' | 'limit' | 'error';

function kindOf(error: unknown): Kind {
  if (isTimeoutError(error)) return 'timeout';
  if (isNetworkError(error)) return 'offline';
  if (getErrorCode(error) === EXPENSE_OVER_LIMIT) return 'limit';
  return 'error';
}

/** Feather-style outline icons, inline so the dialog carries no icon dependency. */
const ICONS: Record<Kind, React.ReactNode> = {
  offline: (
    <>
      <path d="M1 1l22 22" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </>
  ),
  timeout: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  limit: (
    <>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M16 15h2" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </>
  ),
};

/**
 * A failed request as a dialog, titled and coloured for what went wrong: no
 * connection, a slow server, a spending limit, or anything else. The message
 * is already translated by the API, or plain EN/FR text from getErrorMessage
 * for connection problems. Closes on the button, a click outside, or Escape.
 */
export function RequestErrorDialog({ error, onClose }: Props) {
  const t = useT();
  const open = error !== null && error !== undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const kind = kindOf(error);
  const title =
    kind === 'offline'
      ? t.common.offlineTitle
      : kind === 'timeout'
        ? t.common.timeoutTitle
        : kind === 'limit'
          ? t.common.overLimitTitle
          : t.common.errorTitle;
  const tone = kind === 'error' ? 'danger' : 'warning';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="request-error-title"
      aria-describedby="request-error-message"
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.5)',
        }}
      >
        <div className="p-6 flex items-start gap-4">
          <div
            className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: `rgba(var(--${tone}-rgb),0.12)`, color: `var(--${tone})` }}
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
              {ICONS[kind]}
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="request-error-title"
              className="text-base font-bold leading-snug"
              style={{ color: 'var(--foreground)' }}
            >
              {title}
            </h2>
            <p
              id="request-error-message"
              className="text-sm mt-2 leading-relaxed"
              style={{ color: 'var(--muted)' }}
            >
              {getErrorMessage(error)}
            </p>
          </div>
        </div>

        <div
          className="px-6 py-3 flex justify-end"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        >
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
