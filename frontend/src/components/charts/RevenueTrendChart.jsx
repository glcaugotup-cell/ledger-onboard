import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

// Validated categorical slot 1 (blue) from the dataviz reference palette — single series.
const SERIES_COLOR = '#2a78d6';

function formatMonth(value) {
  const [year, month] = value.split('-');
  return new Date(Number(year), Number(month) - 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function RevenueTrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl bg-gradient-to-b from-gray-50/80 to-white px-5 py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm ring-1 ring-gray-200">
          <BanknotesIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-semibold text-gray-800">No revenue recorded yet.</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">Verified payments will build your monthly revenue trend here.</p>
        <Link to="/landlord/payments" className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">View payments</Link>
      </div>
    );
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
