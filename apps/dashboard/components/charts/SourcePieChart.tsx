'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useFormatCurrency } from '../../lib/currency';
import { useThemeStore } from '../../store/theme.store';

interface DataRow { source: string; supplierUsername?: string; totalProfit: string; }
interface Props { data: DataRow[]; }

const LIGHT_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const DARK_COLORS  = ['#6366F1', '#34D399', '#FCD34D', '#F87171', '#A78BFA', '#F472B6'];

export function SourcePieChart({ data }: Props) {
  const theme = useThemeStore((s) => s.theme);
  const formatCurrency = useFormatCurrency();
  const COLORS = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const tooltipBg  = theme === 'dark' ? '#1A1E30' : '#FFFFFF';
  const tooltipBdr = theme === 'dark' ? '#1E2438' : '#E2E6F4';

  const chartData = data
    .map((d) => ({
      name: d.source === 'PERSONAL' ? 'Personal Stock' : `@${d.supplierUsername ?? d.source}`,
      value: Math.max(0, parseFloat(d.totalProfit)),
    }))
    .filter((d) => d.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
        <div className="text-3xl">🥧</div>
        <span className="text-sm">No profit data available</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          outerRadius={88}
          innerRadius={44}
          dataKey="value"
          paddingAngle={3}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => [formatCurrency((v as number) ?? 0), 'Profit']}
          contentStyle={{ borderRadius: '12px', border: `1px solid ${tooltipBdr}`, fontSize: 12, background: tooltipBg, color: theme === 'dark' ? '#E8EBF8' : '#0D1226', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: theme === 'dark' ? '#4E5A80' : '#8492B4' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
