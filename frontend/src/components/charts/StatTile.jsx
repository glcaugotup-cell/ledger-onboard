/** Headline KPI tile — a single number is often the right chart (dataviz skill: "not a chart"). */
export default function StatTile({ label, value, sublabel, tone = 'default', icon: Icon }) {
  const toneClasses = {
    default: 'text-gray-900',
    good: 'text-[#0ca30c]',
    critical: 'text-[#d03b3b]',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClasses[tone]}`}>{value}</p>
      {sublabel && <p className="mt-0.5 text-xs text-gray-500">{sublabel}</p>}
    </div>
  );
}
