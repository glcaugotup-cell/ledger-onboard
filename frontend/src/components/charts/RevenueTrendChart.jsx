import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Validated categorical slot 1 (blue) from the dataviz reference palette — single series.
const SERIES_COLOR = '#2a78d6';

function formatMonth(value) {
  const [year, month] = value.split('-');
  return new Date(Number(year), Number(month) - 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function RevenueTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">No revenue recorded yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e1e0d9" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12, fill: '#898781' }} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#898781' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `₱${v}`} />
        <Tooltip
          formatter={(value) => [`₱${value.toLocaleString()}`, 'Revenue']}
          labelFormatter={formatMonth}
          contentStyle={{ borderRadius: 8, borderColor: '#e1e0d9', fontSize: 12 }}
        />
        <Line type="monotone" dataKey="revenue" stroke={SERIES_COLOR} strokeWidth={2} dot={{ r: 3, fill: SERIES_COLOR }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
