'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSavedMsg('');
  };

  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(body),
    onSuccess: () => {
      setError('');
      setSavedMsg(t.settings.passwordSaved);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Give the user a moment to read the success note, then close.
      setTimeout(() => {
        setSavedMsg('');
        onClose();
      }, 1200);
    },
    onError: (err) => {
      setSavedMsg('');
      setError(getErrorMessage(err) || t.settings.passwordError);
    },
  });

  // Lock body scroll while open + reset fields each time it opens.
  useEffect(() => {
    if (!open) return;
    reset();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg('');
    if (newPassword.length < 8) { setError(t.settings.passwordTooShort); return; }
    if (newPassword !== confirmPassword) { setError(t.settings.passwordMismatch); return; }
    setError('');
    mutation.mutate({ currentPassword, newPassword });
  };

  const fields: { label: string; value: string; set: (v: string) => void; autoComplete: string }[] = [
    { label: t.settings.passwordCurrent, value: currentPassword, set: setCurrentPassword, autoComplete: 'current-password' },
    { label: t.settings.passwordNew, value: newPassword, set: setNewPassword, autoComplete: 'new-password' },
    { label: t.settings.passwordConfirm, value: confirmPassword, set: setConfirmPassword, autoComplete: 'new-password' },
  ];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.35)',
        }}
      >
        <div className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="change-password-title" className="text-base font-bold leading-snug" style={{ color: 'var(--foreground)' }}>
                {t.settings.password}
              </h2>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t.settings.passwordSub}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((f) => (
              <div key={f.label}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>
                  {f.label}
                </label>
                <input
                  type="password"
                  autoComplete={f.autoComplete}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="input w-full"
                />
              </div>
            ))}

            {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
            {savedMsg && <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>{savedMsg}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: '#6366F1', boxShadow: '0 4px 12px -2px rgba(99,102,241,0.35)' }}
              >
                {mutation.isPending ? t.settings.passwordSaving : t.settings.passwordSave}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
