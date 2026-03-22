interface Props {
  label: string;
  value: string;
  sub?: string;
  color?: 'default' | 'danger' | 'success' | 'primary' | 'warning';
  icon?: string;
  loading?: boolean;
}

const colorMap = {
  default: {
    bg:        'var(--card)',
    border:    'var(--border)',
    value:     'var(--foreground)',
    iconBg:    'var(--border)',
    iconColor: 'var(--muted)',
    glow:      'none',
  },
  primary: {
    bg:        'var(--primary-light)',
    border:    'rgba(var(--primary-rgb), 0.2)',
    value:     'var(--primary)',
    iconBg:    'rgba(var(--primary-rgb), 0.15)',
    iconColor: 'var(--primary)',
    glow:      '0 4px 20px rgba(var(--primary-rgb), 0.12)',
  },
  success: {
    bg:        'var(--success-light)',
    border:    'rgba(var(--success-rgb), 0.2)',
    value:     'var(--success)',
    iconBg:    'rgba(var(--success-rgb), 0.15)',
    iconColor: 'var(--success)',
    glow:      '0 4px 20px rgba(var(--success-rgb), 0.1)',
  },
  danger: {
    bg:        'var(--danger-light)',
    border:    'rgba(var(--danger-rgb), 0.2)',
    value:     'var(--danger)',
    iconBg:    'rgba(var(--danger-rgb), 0.15)',
    iconColor: 'var(--danger)',
    glow:      '0 4px 20px rgba(var(--danger-rgb), 0.1)',
  },
  warning: {
    bg:        'var(--warning-light)',
    border:    'rgba(var(--warning-rgb), 0.2)',
    value:     'var(--warning)',
    iconBg:    'rgba(var(--warning-rgb), 0.15)',
    iconColor: 'var(--warning)',
    glow:      '0 4px 20px rgba(var(--warning-rgb), 0.1)',
  },
};

export function KpiCard({ label, value, sub, color = 'default', icon, loading }: Props) {
  const c = colorMap[color];
  return (
    <div
      className="card anim-fade-up"
      style={{
        background: c.bg,
        borderColor: c.border,
        boxShadow: `var(--shadow-sm), ${c.glow}`,
        padding: '20px 24px',
      }}
    >
      {/* Icon + label row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          {label}
        </p>
        {icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: c.iconBg, color: c.iconColor }}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div className="skeleton h-8 w-32 mb-1" />
      ) : (
        <p
          className="text-2xl font-bold tracking-tight"
          style={{ color: c.value, lineHeight: 1.1 }}
        >
          {value}
        </p>
      )}

      {/* Sub */}
      {sub && (
        <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--muted)' }}>{sub}</p>
      )}
    </div>
  );
}
