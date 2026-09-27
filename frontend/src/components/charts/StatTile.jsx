/** Headline KPI tile — a single number is often the right chart (dataviz skill: "not a chart"). */
export default function StatTile({ label, value, sublabel, tone = 'default', icon: Icon, progress, appearance = 'default', palette = 'green' }) {
  const dashboardPalettes = {
    green: { card: 'border-[#d7e9e2] bg-[#f5fbf8]', icon: 'bg-[#0d7557] text-white shadow-inner shadow-black/15' },
    gold: { card: 'border-[#eee2ca] bg-[#fcf8f0]', icon: 'bg-[#c69b4d] text-white shadow-inner shadow-black/10' },
    mint: { card: 'border-[#dbe9e2] bg-[#f6faf7]', icon: 'bg-[#438a6f] text-white shadow-inner shadow-black/10' },
    blue: { card: 'border-[#dce5ee] bg-[#f5f8fb]', icon: 'bg-[#5c99bf] text-white shadow-inner shadow-black/10' },
  };
  const toneClasses = {
    default: 'text-gray-900',
    good: 'text-[#0ca30c]',
    critical: 'text-[#d03b3b]',
  };
  const dashboard = appearance === 'dashboard';
  const colors = dashboardPalettes[palette] || dashboardPalettes.green;
  return (
    <div className={`group relative flex min-h-[7.25rem] flex-col overflow-hidden rounded-xl border p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${dashboard ? `${colors.card} hover:border-brand-200` : 'border-gray-200/80 bg-white hover:border-brand-200 sm:p-5'}`}>
      {!dashboard && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/70 via-emerald-500/60 to-transparent opacity-70" />}
      <div className={`flex gap-3 ${dashboard ? 'items-center' : 'items-start justify-between'}`}>
        {Icon && (
          <span className={`flex shrink-0 items-center justify-center ${dashboard ? `h-11 w-11 rounded-full ${colors.icon}` : 'h-9 w-9 rounded-xl bg-gradient-to-br from-brand-50 to-emerald-50 text-brand-700 ring-1 ring-inset ring-brand-100/70'}`}>
            <Icon className={dashboard ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
          </span>
        )}
        {dashboard ? <p className="text-xs font-medium text-gray-700 sm:text-[13px]">{label}</p> : <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>}
      </div>
      <div className={`flex flex-1 items-end justify-between gap-2 ${dashboard ? 'pl-14' : ''}`}>
        <div className="min-w-0"><p className={`${dashboard ? 'mt-1 text-2xl' : 'mt-2 text-[1.7rem]'} font-bold leading-none tracking-tight tabular-nums ${toneClasses[tone]}`}>{value}</p>
          {sublabel && <p className="mt-1.5 truncate text-[11px] text-gray-500">{sublabel}</p>}
        </div>
        {dashboard && typeof progress === 'number' && <div className="flex shrink-0 items-center gap-1.5 pb-0.5 text-[10px] text-gray-500"><span className="h-px w-2 bg-current" aria-hidden="true" /><span>{Math.max(0, Math.min(100, progress))}%</span></div>}
      </div>
      {typeof progress === 'number' && (
        dashboard
          ? <span className="sr-only" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, progress))} />
          : <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, progress))}><div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-emerald-500 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
      )}
    </div>
  );
}
