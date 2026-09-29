'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { custodyApi, employmentsApi, type Employment } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { getErrorMessage } from '../../../lib/utils';
import { useT } from '../../../lib/i18n';
import { useToast } from '../../../components/ui/Toast';

/**
 * Nobody is in charge of this branch yet. Only a FULL employee can be — a mini
 * already holds their own consigned stock and answers for it through their own
 * handover, so putting one in charge of the shelf as well would be two
 * accountabilities for one person.
 *
 * Any active full employee is choosable here, regardless of their role —
 * appointing them IS the authorization to reach their own accept/handover
 * screen (dashboard `custody.hold` view, or the mobile screen), the same shape
 * as a mini's mandatory `handovers.mini`. See `JwtAuthGuard` and
 * `toActiveEmploymentDto`, which both grant `custody.hold` to whoever is
 * currently named `custodianId` on an OPEN custody row, independent of role.
 */
export default function AppointPanel({
  canWrite,
  isAllShops,
}: {
  canWrite: boolean;
  isAllShops: boolean;
}) {
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  const [custodianId, setCustodianId] = useState('');
  const [sweep, setSweep] = useState(true);
  const [note, setNote] = useState('');

  const { data: employments } = useQuery({
    queryKey: QK.employments({ role: 'employer', status: 'ACTIVE' }),
    queryFn: () => employmentsApi.list({ role: 'employer', status: 'ACTIVE' }),
    staleTime: 60_000,
  });

  const candidates = ((employments as Employment[] | undefined) ?? []).filter(
    (e) => e.tier === 'FULL',
  );

  const appoint = useMutation({
    mutationFn: () =>
      custodyApi.appoint({
        custodianId,
        sweepExistingStock: sweep,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      const chosen = candidates.find((e) => e.employeeId === custodianId);
      const name = chosen?.employee?.name ?? chosen?.employee?.username ?? custodianId;
      qc.invalidateQueries({ queryKey: QK.custodyCurrent });
      setCustodianId('');
      setNote('');
      toast({
        variant: 'success',
        title: t.custody.toastAppointedTitle,
        description: t.custody.toastAppointedBody(name),
      });
    },
    onError: (e) =>
      toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) }),
  });

  return (
    <div className="card p-6" style={{ background: 'var(--card)' }}>
      <h2 className="text-lg font-semibold mb-1">{t.custody.noneTitle}</h2>
      <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
        {t.custody.noneBody}
      </p>

      {isAllShops && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm"
          style={{ background: 'rgba(var(--warning-rgb), 0.1)', color: 'var(--warning)' }}
        >
          {t.custody.pickBranch}
        </div>
      )}

      <div className="grid gap-4 max-w-lg">
        <label className="block">
          <span className="block text-xs font-medium mb-1 opacity-80">{t.custody.employee}</span>
          <select
            className="input w-full"
            value={custodianId}
            onChange={(e) => setCustodianId(e.target.value)}
            disabled={!canWrite}
          >
            <option value="">{t.custody.chooseEmployee}</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.employeeId}>
                {e.employee?.name ?? e.employee?.username ?? e.employeeId}
              </option>
            ))}
          </select>
          {candidates.length === 0 && (
            <span className="text-xs mt-1 block" style={{ color: 'var(--muted)' }}>
              {t.custody.noCandidates}
            </span>
          )}
        </label>

        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            checked={sweep}
            onChange={(e) => setSweep(e.target.checked)}
            disabled={!canWrite}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">{t.custody.sweepLabel}</span>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>
              {t.custody.sweepHint}
            </span>
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium mb-1 opacity-80">{t.custody.noteOptional}</span>
          <input
            className="input w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.custody.notePlaceholder}
            disabled={!canWrite}
          />
        </label>

        <div>
          <button
            className="btn btn-primary"
            disabled={!canWrite || !custodianId || appoint.isPending}
            onClick={() => appoint.mutate()}
          >
            {appoint.isPending ? t.custody.appointing : t.custody.appoint}
          </button>
        </div>
      </div>
    </div>
  );
}
