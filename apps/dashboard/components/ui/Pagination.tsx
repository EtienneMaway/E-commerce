'use client';

import { useEffect } from 'react';
import { useT } from '../../lib/i18n';

/**
 * Steps back when the page you're on stops existing — e.g. you cancelled the
 * only row on the last page — instead of showing an empty table.
 */
export function useClampPage(page: number, totalPages: number | undefined, setPage: (p: number) => void): void {
  useEffect(() => {
    if (totalPages !== undefined && page > totalPages) setPage(Math.max(1, totalPages));
  }, [page, totalPages, setPage]);
}

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (next: number) => void;
}

/**
 * Pagination controls (Prev / "Page X of Y" / Next).
 * Hidden when total fits in a single page.
 */
export function Pagination({ page, totalPages, total, pageSize, onChange }: Props) {
  const t = useT();
  if (total <= pageSize) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {t.common.pageNofM(page, totalPages)}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={prevDisabled}
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            background: prevDisabled ? 'transparent' : 'var(--primary-light)',
            color: prevDisabled ? 'var(--muted)' : 'var(--primary)',
            border: '1px solid var(--border)',
            opacity: prevDisabled ? 0.5 : 1,
          }}
          aria-label={t.common.prevPage}
        >
          ←
        </button>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={nextDisabled}
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            background: nextDisabled ? 'transparent' : 'var(--primary-light)',
            color: nextDisabled ? 'var(--muted)' : 'var(--primary)',
            border: '1px solid var(--border)',
            opacity: nextDisabled ? 0.5 : 1,
          }}
          aria-label={t.common.nextPage}
        >
          →
        </button>
      </div>
    </div>
  );
}
