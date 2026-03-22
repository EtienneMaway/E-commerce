type Variant =
  | 'supplier' | 'personal' | 'consigned'
  | 'profit' | 'loss' | 'neutral'
  | 'pending' | 'accepted' | 'rejected' | 'cancelled';

const styles: Record<Variant, { bg: string; color: string; border: string }> = {
  supplier:  { bg: 'rgba(var(--primary-rgb), 0.1)',   color: 'var(--primary)',  border: 'rgba(var(--primary-rgb), 0.2)' },
  personal:  { bg: 'rgba(var(--success-rgb), 0.1)',   color: 'var(--success)',  border: 'rgba(var(--success-rgb), 0.2)' },
  consigned: { bg: 'rgba(var(--warning-rgb), 0.1)',   color: 'var(--warning)',  border: 'rgba(var(--warning-rgb), 0.2)' },
  profit:    { bg: 'rgba(var(--success-rgb), 0.1)',   color: 'var(--success)',  border: 'rgba(var(--success-rgb), 0.2)' },
  loss:      { bg: 'rgba(var(--danger-rgb),  0.1)',   color: 'var(--danger)',   border: 'rgba(var(--danger-rgb),  0.2)' },
  neutral:   { bg: 'var(--border)',                   color: 'var(--muted)',    border: 'transparent' },
  pending:   { bg: 'rgba(var(--warning-rgb), 0.1)',   color: 'var(--warning)',  border: 'rgba(var(--warning-rgb), 0.2)' },
  accepted:  { bg: 'rgba(var(--success-rgb), 0.1)',   color: 'var(--success)',  border: 'rgba(var(--success-rgb), 0.2)' },
  rejected:  { bg: 'rgba(var(--danger-rgb),  0.1)',   color: 'var(--danger)',   border: 'rgba(var(--danger-rgb),  0.2)' },
  cancelled: { bg: 'var(--border)',                   color: 'var(--muted)',    border: 'transparent' },
};

export function Badge({ label, variant = 'neutral' }: { label: string; variant?: Variant }) {
  const s = styles[variant];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
}
