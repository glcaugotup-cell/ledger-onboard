import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Validated categorical slots 1/2/3 (blue/orange/aqua) — first three slots clear
// all-pairs CVD/contrast gates in both modes per the dataviz reference palette.
const COLORS = { available: '#1baf7a', occupied: '#2a78d6', maintenance: '#eb6834' };

export default function RoomStatusChart({ breakdown }) {
  const data = [
    { status: 'Available', key: 'available', count: breakdown.available },
    { status: 'Occupied', key: 'occupied', count: breakdown.occupied },
    { status: 'Maintenance', key: 'maintenance', count: breakdown.maintenance },
  ];
  const allZero = data.every((d) => d.count === 0);
  if (allZero) return <p className="py-12 text-center text-sm text-gray-400">No rooms yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#e1e0d9" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#898781' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="status" tick={{ fontSize: 12, fill: '#52514e' }} axisLine={false} tickLine={false} width={80} />
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e1e0d9', fontSize: 12 }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
          {data.map((d) => (
            <Cell key={d.key} fill={COLORS[d.key]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
