/** Headline KPI tile — a single number is often the right chart (dataviz skill: "not a chart"). */
export default function StatTile({ label, value, sublabel, tone = 'default' }) {
  const toneClasses = {
    default: 'text-gray-900',
    good: 'text-[#0ca30c]',
    critical: 'text-[#d03b3b]',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClasses[tone]}`}>{value}</p>
      {sublabel && <p className="mt-0.5 text-xs text-gray-400">{sublabel}</p>}
    </div>
  );
}
