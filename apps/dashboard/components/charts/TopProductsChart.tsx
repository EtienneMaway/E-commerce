'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useFormatCurrency } from '../../lib/currency';
import { useThemeStore } from '../../store/theme.store';

interface DataRow { productName: string; totalProfit: string; totalRevenue: string; totalQtySold: string; }
interface Props { data: DataRow[]; rankBy?: 'profit' | 'revenue' | 'qty'; }

const LIGHT_COLORS = ['#4F46E5', '#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE'];
const DARK_COLORS  = ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'];

export function TopProductsChart({ data, rankBy = 'profit' }: Props) {
  const theme = useThemeStore((s) => s.theme);
  const formatCurrency = useFormatCurrency();
  const COLORS = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const gridColor  = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tickColor  = theme === 'dark' ? '#4E5A80' : '#8492B4';
  const tooltipBg  = theme === 'dark' ? '#1A1E30' : '#FFFFFF';
  const tooltipBdr = theme === 'dark' ? '#1E2438' : '#E2E6F4';

  const chartData = data.slice(0, 5).map((d) => ({
    name: d.productName.charAt(0).toUpperCase() + d.productName.slice(1),
    value: rankBy === 'qty' ? Number(d.totalQtySold) : parseFloat(rankBy === 'profit' ? d.totalProfit : d.totalRevenue),
    label: rankBy === 'qty' ? d.totalQtySold : formatCurrency(rankBy === 'profit' ? d.totalProfit : d.totalRevenue),
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
        <div className="text-3xl">📊</div>
        <span className="text-sm">No data available</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} tickFormatter={rankBy === 'qty' ? undefined : (v) => formatCurrency(v)} />
        <Tooltip
          formatter={(v) => { const n = (v as number) ?? 0; return [rankBy === 'qty' ? n : formatCurrency(n), rankBy === 'profit' ? 'Profit' : rankBy === 'revenue' ? 'Revenue' : 'Qty']; }}
          contentStyle={{ borderRadius: '12px', border: `1px solid ${tooltipBdr}`, fontSize: 12, background: tooltipBg, color: theme === 'dark' ? '#E8EBF8' : '#0D1226', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
          cursor={{ fill: 'rgba(99,102,241,0.05)' }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
