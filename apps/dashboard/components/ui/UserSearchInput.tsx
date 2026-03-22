'use client';

import { useState, useEffect, useRef } from 'react';
import { usersApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface UserOption {
  id: string;
  username: string;
}

interface Props {
  label: string;
  value: UserOption | null;
  onChange: (user: UserOption | null) => void;
  placeholder?: string;
}

export function UserSearchInput({ label, value, onChange, placeholder }: Props) {
  const t = useT();
  const resolvedPlaceholder = placeholder ?? t.userSearch.placeholder;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await usersApi.search(query.trim());
        setResults(data as UserOption[]);
        setOpen(true);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const select = (user: UserOption) => {
    onChange(user);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>{label}</label>
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <span style={{ color: 'var(--foreground)' }}>@{value.username}</span>
          <button
            type="button"
            onClick={clear}
            className="ml-auto text-xs"
            style={{ color: 'var(--muted)' }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={resolvedPlaceholder}
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--muted)' }}>{t.userSearch.searching}</span>
          )}
          {open && results.length > 0 && (
            <ul
              className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg overflow-hidden"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={() => select(u)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 transition-colors"
                    style={{ color: 'var(--foreground)' }}
                  >
                    @{u.username}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && !loading && results.length === 0 && query.trim().length >= 2 && (
            <div
              className="absolute z-50 w-full mt-1 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--muted)' }}
            >
              {t.userSearch.noUsers}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
