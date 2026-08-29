'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  employeeRolesApi,
  type EmployeeRoleWithUsage,
  type ServiceCatalog,
  type ServiceDefinition,
} from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useT, type Translations } from '../../../../lib/i18n';
import { getErrorMessage } from '../../../../lib/utils';
import { useToast } from '../../../../components/ui/Toast';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';
import { computeRoleFit } from '../../../../lib/role-fit';

/** Catalogue keys are data, not i18n identifiers — look them up defensively so a
 *  key added on the API before the client ships still renders as itself. */
function serviceLabel(t: Translations, key: string): string {
  return (t.roles.svc as Record<string, string>)[key] ?? key;
}
function serviceHint(t: Translations, key: string): string | null {
  return (t.roles.svc as Record<string, string>)[`${key}.hint`] ?? null;
}
function groupLabel(t: Translations, group: string): string {
  return (t.roles as unknown as Record<string, string>)[`group${group}`] ?? group;
}
function presetLabel(t: Translations, key: string): string {
  return (t.roles as unknown as Record<string, string>)[`preset${key}`] ?? key;
}

export default function RolesPage() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EmployeeRoleWithUsage | 'new' | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: QK.employeeRoles,
    queryFn: () => employeeRolesApi.list(),
  });
  const { data: catalog } = useQuery({
    queryKey: QK.serviceCatalog,
    queryFn: () => employeeRolesApi.catalog(),
    // Static reference data — no reason to refetch it during a session.
    staleTime: Infinity,
  });

  const remove = useMutation({
    mutationFn: (id: string) => employeeRolesApi.delete(id),
    onSuccess: () => {
      toast({ title: t.roles.deleted, variant: 'success' });
      qc.invalidateQueries({ queryKey: QK.employeeRoles });
    },
    onError: (err) => toast({ title: getErrorMessage(err), variant: 'error' }),
  });

  const handleDelete = async (role: EmployeeRoleWithUsage) => {
    if (role.assignedCount > 0) {
      toast({ title: t.roles.deleteInUse, variant: 'error' });
      return;
    }
    const ok = await confirm({
      title: t.roles.deleteTitle,
      description: t.roles.deleteBody,
      variant: 'danger',
      confirmLabel: t.roles.delete,
    });
    if (ok) remove.mutate(role.id);
  };

  return (
    <>
      {/* .page-header is itself the flex row — an extra wrapper would stop the
          button being pushed to the far edge. */}
      <div className="page-header">
        <div>
          <Link href="/employees" className="text-sm" style={{ color: 'var(--muted)' }}>
            ← {t.roles.backToEmployees}
          </Link>
          <h1 className="page-title mt-1">{t.roles.title}</h1>
          <p className="page-sub">{t.roles.subtitle}</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn btn-primary flex-shrink-0">
          + {t.roles.newRole}
        </button>
      </div>

      <div className="page-content">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />
            ))}
          </div>
        ) : !roles?.length ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ border: '1px dashed var(--border)', background: 'var(--card)' }}
          >
            <p className="font-semibold">{t.roles.noRoles}</p>
            <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
              {t.roles.noRolesHint}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role.id} className="card p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{role.name}</span>
                    <Pill>
                      {role.services.length} {t.roles.servicesCount}
                    </Pill>
                    <Pill accent={role.assignedCount > 0}>
                      {role.assignedCount > 0
                        ? `${role.assignedCount} ${
                            role.assignedCount === 1 ? t.roles.assignedOne : t.roles.assignedCount
                          }`
                        : t.roles.assignedNone}
                    </Pill>
                  </div>
                  {role.description && (
                    <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
                      {role.description}
                    </p>
                  )}
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                    {role.services.map((k) => serviceLabel(t, k)).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setEditing(role)} className="btn btn-secondary">
                    {t.roles.edit}
                  </button>
                  <button
                    onClick={() => void handleDelete(role)}
                    disabled={remove.isPending}
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)' }}
                  >
                    {t.roles.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && catalog && (
        <RoleEditor
          catalog={catalog}
          role={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** One "this role gives an X: N features" readout, reddened when N is nothing useful. */
function FitChip({ label, text, warn }: { label: string; text: string; warn: boolean }) {
  return (
    <span className="text-xs flex items-center gap-1.5">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className="px-2 py-0.5 rounded-full font-medium"
        style={
          warn
            ? { background: 'rgba(var(--danger-rgb),0.12)', color: 'var(--danger)' }
            : { background: 'rgba(var(--success-rgb),0.12)', color: 'var(--success)' }
        }
      >
        {text}
      </span>
    </span>
  );
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={
        accent
          ? { background: 'rgba(var(--primary-rgb),0.12)', color: 'var(--primary)' }
          : { background: 'var(--surface)', color: 'var(--muted)' }
      }
    >
      {children}
    </span>
  );
}

function RoleEditor({
  catalog,
  role,
  onClose,
}: {
  catalog: ServiceCatalog;
  role: EmployeeRoleWithUsage | null;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.services ?? []));

  const byKey = useMemo(
    () => new Map(catalog.services.map((s) => [s.key, s])),
    [catalog.services],
  );

  /**
   * Keys pulled in by something else that is ticked. Shown as checked-and-locked
   * so the employer sees the real reach of what they picked — the API expands
   * these anyway, and a box that silently means more than it shows is worse.
   */
  const implied = useMemo(() => {
    const out = new Set<string>();
    const walk = (key: string) => {
      for (const dep of byKey.get(key)?.implies ?? []) {
        if (!out.has(dep)) {
          out.add(dep);
          walk(dep);
        }
      }
    };
    for (const key of selected) walk(key);
    // An explicit tick wins over an implied one.
    for (const key of selected) out.delete(key);
    return out;
  }, [selected, byKey]);

  /** A service no employee tier can hold is shown disabled rather than hidden —
   *  otherwise "why can't I give them withdrawals?" has no answer on screen. */
  const grantable = (s: ServiceDefinition) => s.tiers.some((tier) => tier !== 'OWNER');

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        services: [...selected],
      };
      return role ? employeeRolesApi.update(role.id, body) : employeeRolesApi.create(body);
    },
    onSuccess: () => {
      toast({ title: role ? t.roles.saved : t.roles.created, variant: 'success' });
      qc.invalidateQueries({ queryKey: QK.employeeRoles });
      // A re-scoped role changes what the affected employees see immediately.
      qc.invalidateQueries({ queryKey: QK.me });
      onClose();
    },
    onError: (err) => toast({ title: getErrorMessage(err), variant: 'error' }),
  });

  const effectiveCount = selected.size + implied.size;

  // How this role lands for each kind of employee. Built here rather than only
  // at assignment time so an employer sees straight away that, say, a role of
  // owner-only stock features is useless to a mini.
  const fitFull = computeRoleFit([...selected], 'FULL_EMPLOYEE', catalog);
  const fitMini = computeRoleFit([...selected], 'MINI_EMPLOYEE', catalog);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-3xl rounded-xl border flex flex-col anim-scale-in"
        style={{
          background: 'var(--card)',
          borderColor: 'rgba(127,127,127,0.2)',
          maxHeight: '90vh',
        }}
      >
        <div
          className="p-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="font-semibold">{role ? t.roles.editTitle : t.roles.createTitle}</h2>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: 'var(--muted)' }}>
            ×
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">{t.roles.nameLabel}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.roles.namePlaceholder}
                maxLength={80}
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t.roles.descriptionLabel}</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.roles.descriptionPlaceholder}
                maxLength={240}
                className="input mt-1"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium">{t.roles.presetsLabel}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {catalog.presets.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => setSelected(new Set(preset.services))}
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                >
                  {presetLabel(t, preset.key)}
                </button>
              ))}
              <button
                onClick={() => setSelected(new Set())}
                className="btn btn-ghost"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
              >
                {t.roles.clearAll}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <span className="text-sm font-medium">{t.roles.servicesLabel}</span>
            {catalog.groups.map((group) => {
              const rows = catalog.services.filter((s) => s.group === group);
              if (!rows.length) return null;
              return (
                <div key={group}>
                  <h3
                    className="text-xs font-bold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--muted)' }}
                  >
                    {groupLabel(t, group)}
                  </h3>
                  <div className="space-y-1">
                    {rows.map((s) => {
                      const isImplied = implied.has(s.key);
                      const canGrant = grantable(s);
                      // Mandatory for every tier that can hold it at all — the
                      // checkbox would be a lie, so show it on and locked.
                      const isAlwaysOn =
                        s.mandatory.length > 0 &&
                        s.tiers.every((tier) => s.mandatory.includes(tier));
                      const checked = selected.has(s.key) || isImplied || isAlwaysOn;
                      const hint = serviceHint(t, s.key);
                      return (
                        <label
                          key={s.key}
                          className="flex items-start gap-3 rounded-lg px-3 py-2"
                          style={{
                            opacity: canGrant ? 1 : 0.55,
                            cursor: canGrant && !isImplied ? 'pointer' : 'default',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canGrant || isImplied || isAlwaysOn}
                            onChange={() => toggle(s.key)}
                            className="mt-1"
                          />
                          <span className="min-w-0">
                            <span className="text-sm flex items-center gap-2 flex-wrap">
                              {serviceLabel(t, s.key)}
                              {!canGrant && <Pill>{t.roles.ownerOnlyBadge}</Pill>}
                              {isAlwaysOn && <Pill accent>{t.roles.alwaysOnBadge}</Pill>}
                              {isImplied && !isAlwaysOn && <Pill accent>{t.roles.impliedBadge}</Pill>}
                              {canGrant && !s.tiers.includes('FULL_EMPLOYEE') && (
                                <Pill>{t.roles.miniOnlyBadge}</Pill>
                              )}
                            </span>
                            {(hint || isImplied || !canGrant || isAlwaysOn) && (
                              <span className="block text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                {isAlwaysOn
                                  ? hint
                                  : isImplied
                                    ? t.roles.impliedHint
                                    : !canGrant
                                      ? t.roles.ownerOnlyHint
                                      : hint}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {effectiveCount === 0 && (
            <p
              className="text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(var(--warning-rgb),0.12)', color: 'var(--warning)' }}
            >
              {t.roles.emptyRoleWarning}
            </p>
          )}

          {effectiveCount > 0 && (
            <div
              className="rounded-lg px-3 py-2 flex items-center gap-4 flex-wrap"
              style={{ background: 'var(--surface)' }}
            >
              <span className="text-xs font-medium">{t.roles.fitEditorLabel}</span>
              <FitChip
                label={t.roles.fitEditorFull}
                text={t.roles.fitEditorCount(fitFull.granted.length)}
                warn={fitFull.addsNothing}
              />
              <FitChip
                label={t.roles.fitEditorMini}
                text={t.roles.fitEditorCount(fitMini.granted.length)}
                warn={fitMini.addsNothing}
              />
            </div>
          )}
        </div>

        <div
          className="p-5 flex justify-end gap-2 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button onClick={onClose} className="btn btn-secondary">
            {t.common.cancel}
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
            className="btn btn-primary"
          >
            {save.isPending ? t.roles.saving : t.roles.save}
          </button>
        </div>
      </div>
    </div>
  );
}
