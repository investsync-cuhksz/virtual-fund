'use client';
import { useEffect, useState } from 'react';
import NavChart from '@/components/NavChart';
import Shell from '@/components/Shell';
import { card, td, th } from '@/components/ui';
import { getDashboard } from '@/lib/api';
import { pct, pp, shortDate, stamp, tone, usd } from '@/lib/format';
import type { Dashboard } from '@/lib/types';

function View() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState('');
  const load = () => { getDashboard().then(setD).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the dashboard.')); };
  useEffect(() => { load(); }, []);

  if (err) return <p role="alert" className="rounded-lg border border-red-700 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">{err}</p>;
  if (!d) return <p className="text-sm text-slate-600">Loading the dashboard…</p>;

  const p = d.performance;
  const kpis = [
    { k: 'NAV', v: usd(d.fund.navCents), c: '' },
    { k: 'Cash', v: usd(d.fund.cashCents), c: '' },
    { k: 'Return since start', v: pct(p.fundSinceStartPercent, 2, true), c: tone(p.fundSinceStartPercent) },
    { k: `vs ${p.benchmarkName} since start`, v: pp(p.excessSinceStartPercent), c: tone(p.excessSinceStartPercent) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Fund dashboard</h1>
          <p className="mt-1 text-slate-600">As of the {shortDate(d.asOf)} US close. Read-only.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((x) => (
          <div key={x.k} className={card}>
            <div className="text-xs text-slate-600">{x.k}</div>
            <div className={`mt-1 text-2xl font-bold ${x.c}`}>{x.v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className={card}>
          <h2 className="mb-3 text-base font-bold">NAV vs {p.benchmarkName} (rebased to 100)</h2>
          <NavChart points={d.chart} benchmark={p.benchmarkName} />
        </section>
        <section className={card}>
          <h2 className="mb-3 text-base font-bold">Performance since start</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              <tr><td className={td}>Fund</td><td className={`${td} text-right font-semibold ${tone(p.fundSinceStartPercent)}`}>{pct(p.fundSinceStartPercent, 2, true)}</td></tr>
              <tr><td className={td}>{p.benchmarkName}</td><td className={`${td} text-right font-semibold ${tone(p.benchmarkSinceStartPercent)}`}>{pct(p.benchmarkSinceStartPercent, 2, true)}</td></tr>
              <tr><td className={td}>Fund minus {p.benchmarkName}</td><td className={`${td} text-right font-semibold ${tone(p.excessSinceStartPercent)}`}>{pp(p.excessSinceStartPercent)}</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className={`${card} overflow-x-auto`}>
          <h2 className="mb-3 text-base font-bold">Holdings</h2>
          {d.holdings.length === 0 ? (
            <p className="text-sm text-slate-600">No holdings yet. Approve an order, then run the valuation.</p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr><th className={th}>Ticker</th><th className={th}>Name</th><th className={`${th} text-right`}>Shares</th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>Weight</th><th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>Return</th></tr></thead>
              <tbody>
                {d.holdings.map((h) => (
                  <tr key={h.ticker}>
                    <td className={`${td} font-semibold`}>{h.ticker}</td><td className={td}>{h.name}</td>
                    <td className={`${td} text-right`}>{h.quantity}</td><td className={`${td} text-right`}>{usd(h.lastPriceCents)}</td>
                    <td className={`${td} text-right`}>{pct(h.weightPercent)}</td><td className={`${td} text-right`}>{usd(h.valueCents)}</td>
                    <td className={`${td} text-right ${tone(h.returnPercent)}`}>{pct(h.returnPercent, 1, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className={card}>
          <h2 className="mb-3 text-base font-bold">Sector breakdown</h2>
          <ul className="space-y-4">
            {d.sectorBreakdown.map((s) => {
              const isCash = s.sector === 'Cash';
              return (
                <li key={s.sector} className="text-sm">
                  <div className="flex justify-between"><span>{s.sector}</span><span>{pct(s.weightPercent)}</span></div>
                  <div className="mt-1 h-2.5 rounded-full bg-slate-200">
                    <div className={`h-2.5 rounded-full ${isCash ? 'bg-slate-400' : 'bg-blue-800'}`} style={{ width: `${Math.min(100, isCash ? s.weightPercent : (s.weightPercent / 30) * 100)}%` }} />
                  </div>
                  {!isCash && <div className="mt-1 text-xs text-slate-600">Limit 30%</div>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <h2 className="mb-3 text-base font-bold">Trade history (linked to each pitch)</h2>
        {d.recentTrades.length === 0 ? (
          <p className="text-sm text-slate-600">No trades yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Instrument</th><th className={th}>Qty</th><th className={th}>Price</th><th className={th}>Fee</th><th className={th}>Order</th><th className={th}>Pitch</th></tr></thead>
            <tbody>
              {d.recentTrades.map((t) => (
                <tr key={t.id}>
                  <td className={`${td} whitespace-nowrap`}>{t.executedAt ? stamp(t.executedAt) : shortDate(t.date)}</td><td className={td}>{t.side === 'BUY' ? 'Buy' : 'Sell'} fill</td><td className={`${td} font-semibold`}>{t.ticker}</td>
                  <td className={td}>{t.quantity}</td><td className={td}>{usd(t.priceCents)}</td><td className={td}>{usd(t.feeCents)}</td>
                  <td className={td}>{t.orderId.replace('ord_', '#')}</td><td className={td}>{t.pitch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return <Shell><View /></Shell>;
}
