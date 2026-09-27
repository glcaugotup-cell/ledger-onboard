const STATUSES = [
  { label: 'Available', key: 'available', color: '#10b981' },
  { label: 'Occupied', key: 'occupied', color: '#1f2937' },
  { label: 'Maintenance', key: 'maintenance', color: '#f59e0b' },
];

export default function RoomStatusChart({ breakdown }) {
  const total = STATUSES.reduce((sum, status) => sum + (breakdown?.[status.key] || 0), 0);

  if (total === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">No rooms yet.</p>;
  }

  return (
    <div className="space-y-5 py-2">
      {STATUSES.map(({ label, key, color }) => {
        const count = breakdown[key] || 0;
        const percentage = (count / total) * 100;
        const displayPercentage = Math.round(percentage);

        return (
          <div key={key} title={`${count} of ${total} rooms`}>
            <div className="mb-2 flex items-center justify-between gap-4 px-0.5 text-sm">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="tabular-nums text-gray-500">{displayPercentage}%</span>
            </div>
            <div
              className="h-3 overflow-hidden rounded-full bg-gray-100"
              role="progressbar"
              aria-label={`${label} rooms`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
            >
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${percentage}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
