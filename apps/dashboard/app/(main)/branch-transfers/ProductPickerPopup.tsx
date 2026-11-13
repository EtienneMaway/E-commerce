'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../../lib/i18n';
import type { PickProduct } from '../../../lib/transfer-pick';

const PAGE_SIZE = 10;

interface Props {
  readonly catalog: readonly PickProduct[];
  readonly loading: boolean;
  /** Keys already picked in the form. */
  readonly selected: ReadonlySet<string>;
  /** Called with the full new selection on "Done". */
  readonly onDone: (keys: string[]) => void;
  readonly onClose: () => void;
}

/**
 * The product chooser for the send-transfer form: search + pages of 10, so a
 * branch with hundreds of products doesn't turn the form into a wall of rows.
 * Ticks are a draft until "Done" — closing discards them.
 */
export default function ProductPickerPopup({ catalog, loading, selected, onDone, onClose }: Props) {
  const t = useT();
  const b = t.branchTransfers;
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? catalog.filter((p) => p.productName.toLowerCase().includes(q)) : catalog;
  }, [catalog, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const allOnPage = slice.length > 0 && slice.every((p) => draft.has(p.key));

  const toggle = (key: string): void =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const togglePage = (): void =>
    setDraft((d) => {
      const n = new Set(d);
      for (const p of slice) {
        if (allOnPage) n.delete(p.key);
        else n.add(p.key);
      }
      return n;
    });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl border flex flex-col"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)', maxHeight: '88vh' }}
      >
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              {b.pickerTitle}
            </h3>
            <button type="button" className="btn btn-ghost text-xs" onClick={onClose} aria-label={t.common.cancel}>
              ✕
            </button>
          </div>
          <input
            ref={searchRef}
            className="input mt-3"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={b.searchProducts}
          />
          <div className="flex items-center justify-between mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            <span>
              {filtered.length > 0 ? b.showing(start + 1, start + slice.length, filtered.length) : ''}
            </span>
            {slice.length > 0 && (
              <button type="button" className="font-semibold" style={{ color: 'var(--primary)' }} onClick={togglePage}>
                {allOnPage ? b.unselectPage : b.selectPage}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {loading && catalog.length === 0 ? (
            <p className="text-sm px-5 py-4" style={{ color: 'var(--muted)' }}>
              {t.common.loading}
            </p>
          ) : catalog.length === 0 ? (
            <p className="text-sm px-5 py-4" style={{ color: 'var(--muted)' }}>
              {b.noStock}
            </p>
          ) : slice.length === 0 ? (
            <p className="text-sm px-5 py-4" style={{ color: 'var(--muted)' }}>
              {b.noMatch}
            </p>
          ) : (
            slice.map((p) => {
              const on = draft.has(p.key);
              return (
                <label
                  key={p.key}
                  className="flex items-center gap-3 px-5 py-2.5 cursor-pointer border-b last:border-b-0"
                  style={{ borderColor: 'var(--border-subtle)', background: on ? 'var(--primary-light)' : undefined }}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(p.key)} className="h-4 w-4 accent-[var(--primary)]" />
                  <span className="flex-1 text-sm capitalize" style={{ color: 'var(--foreground)' }}>
                    {p.productName}
                    {p.kind === 'group' && (
                      <span
                        className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--surface)', color: 'var(--muted)' }}
                      >
                        {b.sizedTag} · {p.sizes.length}
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                    {b.availPieces(p.available)}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="p-4 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary text-xs px-3"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            ← {b.prevPage}
          </button>
          <span className="text-xs tabular-nums px-1" style={{ color: 'var(--muted)' }}>
            {b.pageOf(current, pages)}
          </span>
          <button
            type="button"
            className="btn btn-secondary text-xs px-3"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            {b.nextPage} →
          </button>
          <button type="button" className="btn btn-primary ml-auto" onClick={() => onDone([...draft])}>
            {b.pickerDone(draft.size)}
          </button>
        </div>
      </div>
    </div>
  );
}
