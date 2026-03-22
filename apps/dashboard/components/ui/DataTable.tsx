'use client';

import { useState, useMemo } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  getValue?: (row: T) => string | number;
}

interface Props<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: Column<any>[];
  data: T[];
  keyField: keyof T;
  searchPlaceholder?: string;
  searchFields?: (keyof T)[];
}

export function DataTable<T extends object>({
  columns, data, keyField, searchPlaceholder = 'Search...', searchFields = [],
}: Props<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) => {
      const r = row as Record<string, unknown>;
      return searchFields.some((f) => String(r[f as string] ?? '').toLowerCase().includes(q));
    });
  }, [data, search, searchFields]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    return [...filtered].sort((a, b) => {
      const ra = a as Record<string, unknown>;
      const rb = b as Record<string, unknown>;
      const av = col?.getValue ? col.getValue(a) : (ra[sortKey] as string | number) ?? '';
      const bv = col?.getValue ? col.getValue(b) : (rb[sortKey] as string | number) ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div className="anim-fade-up">
      {searchFields.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--muted)' }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="input pl-9 w-full sm:w-72"
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="btn btn-ghost text-xs px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="data-table-wrap overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="data-table-head-row">
              {columns.map((col) => (
                <th key={col.key} className="data-table-head-cell">
                  {col.sortable ? (
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                      style={{ color: sortKey === col.key ? 'var(--primary)' : 'var(--muted)' }}
                    >
                      {col.header}
                      <span className="text-xs">
                        {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center" style={{ color: 'var(--muted)' }}>
                  <div className="text-3xl mb-2">🔍</div>
                  <div className="text-sm font-medium">No results found</div>
                  {search && <div className="text-xs mt-0.5">Try a different search term</div>}
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={String((row as Record<string, unknown>)[keyField as string])}
                  className="data-table-row"
                  style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--surface)' }}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="data-table-cell">
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > 0 && (
        <p className="text-xs mt-2 font-medium" style={{ color: 'var(--muted)' }}>
          {sorted.length} row{sorted.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}
    </div>
  );
}
