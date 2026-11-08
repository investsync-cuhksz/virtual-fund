import type { Dashboard } from '@/lib/types';

// Plain SVG line chart: fund index vs benchmark index, both rebased to 100.
export default function NavChart({ points, benchmark }: { points: Dashboard['chart']; benchmark: string }) {
  if (points.length === 0) return <p className="py-10 text-sm text-slate-600">No snapshots yet. Run a valuation to start the chart.</p>;
  const W = 720, H = 240, L = 48, R = 16, T = 16, B = 28;
  const vals = points.flatMap((p) => [p.fundIndex, p.benchmarkIndex]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 0.2) { const m = (hi + lo) / 2; lo = m - 0.1; hi = m + 0.1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const x = (i: number) => L + (points.length < 2 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const line = (k: 'fundIndex' | 'benchmarkIndex') => points.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
  const ticks = [0, 1, 2, 3].map((n) => lo + ((hi - lo) * n) / 3);
  const f = points[points.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Fund index ${f.fundIndex.toFixed(2)} and ${benchmark} index ${f.benchmarkIndex.toFixed(2)} on ${f.date}, both rebased to 100`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-slate-200" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-600 text-[11px]">{t.toFixed(2)}</text>
          </g>
        ))}
        <polyline points={line('benchmarkIndex')} fill="none" strokeWidth="2.5" strokeDasharray="6 5" className="stroke-slate-500" />
        <polyline points={line('fundIndex')} fill="none" strokeWidth="3" className="stroke-blue-800" />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.fundIndex)} r="4" className="fill-blue-800" />
            <circle cx={x(i)} cy={y(p.benchmarkIndex)} r="3.5" className="fill-slate-500" />
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-600 text-[11px]">{p.date.slice(5)}</text>
          </g>
        ))}
      </svg>
      <p className="mt-2 flex gap-6 text-sm">
        <span><b className="text-blue-800">━</b> Fund {f.fundIndex.toFixed(2)}</span>
        <span><b className="text-slate-500">╍</b> {benchmark} {f.benchmarkIndex.toFixed(2)}</span>
      </p>
    </div>
  );
}
