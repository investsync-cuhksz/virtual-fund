'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { card, field, primary, td, th } from '@/components/ui';
import { listValuationRuns, runValuation } from '@/lib/api';
import { shortDate, stamp, usd } from '@/lib/format';
import type { ValuationRun } from '@/lib/types';
import { marketDates, nextMarketDate } from '@/lib/market-data';

const STEPS = [
    'Use the cached closing prices for the date you pick',
    'Fill approved orders: whole shares, with a 0.10% fee',
    'Add one ledger row for each fill',
    'Recalculate cash, holdings and NAV',
    'Save the daily snapshot that the dashboard shows',
];

function nextTradingDate() {
    const todayInNewYork = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return nextMarketDate(todayInNewYork) ?? '';
}

function Valuation() {
    const [date, setDate] = useState(nextTradingDate);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [log, setLog] = useState<ValuationRun[]>([]);
    const [last, setLast] = useState<ValuationRun | null>(null);
    const [repeat, setRepeat] = useState(false);

    useEffect(() => {
        listValuationRuns().then((rs) => {
            setLog(rs);
            if (rs[0]) setDate((current) => current <= rs[0].date ? (nextMarketDate(rs[0].date) ?? current) : current);
        }).catch(() => { });
    }, []);

    async function run() {
        setBusy(true);
        setErr('');
        try {
            const before = await listValuationRuns().catch(() => log);
            const r = await runValuation(date);
            const already = before.some((x) => x.date === r.date); // this date was run before
            setLast(already ? { ...r, filledOrderIds: [] } : r); // run again: 0 filled this time
            setRepeat(already);
            setDate(nextMarketDate(r.date) ?? r.date);
            listValuationRuns()
                .then(setLog)
                .catch(() => { if (!already) setLog((l) => [r, ...l]); });
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'The valuation run failed.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Daily valuation</h1>
                <p className="mt-1 text-slate-600">In the demo you run it by hand. Later it runs on its own after markets close.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className={card}>
                    <h2 className="text-base font-bold">Run valuation</h2>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                        <div>
                            <label htmlFor="vdate" className="text-sm font-semibold">Valuation date (US trading day)</label>
                            <input id="vdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-48`} />
                        </div>
                        <button type="button" onClick={run} disabled={busy || !date} className={primary}>
                            {busy ? 'Running…' : 'Run valuation now'}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">Synthetic demo closes: {marketDates[0]} to {marketDates.at(-1)}. Choose a listed trading date.</p>

                    <div role="status" className="mt-5 text-sm">
                        {err && <p className="font-semibold text-red-800">{err}</p>}
                        {!err && last && (
                            <>
                                <p className={`font-semibold ${last.status === 'SUCCESS' ? 'text-green-700' : 'text-red-700'}`}>
                                    {last.status === 'SUCCESS' ? 'Success' : last.status} for {shortDate(last.date)}
                                </p>
                                <p className="mt-1">{last.filledOrderIds.length} order(s) filled · NAV {usd(last.navCents)} · Cash {usd(last.cashCents)}</p>
                                {repeat && <p className="mt-1 text-slate-600">Already run for this date, so nothing was filled and the log is unchanged.</p>}
                                {!repeat && last.filledOrderIds.length === 0 && <p className="mt-1 text-slate-600">No orders were filled for this date. The run is still saved in the log.</p>}
                                <p className="mt-2"><Link href="/dashboard" className="font-semibold text-blue-800 underline">View the dashboard</Link></p>
                            </>
                        )}
                        {!err && !last && <p className="text-slate-600">No run yet. Approve an order first, then run the valuation.</p>}
                    </div>
                </section>

                <section className={card}>
                    <h2 className="text-base font-bold">What a run does</h2>
                    <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
                        {STEPS.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                    <p className="mt-4 text-xs text-slate-600">Running the same date again fills nothing twice.</p>
                </section>
            </div>

            <section className={`${card} overflow-x-auto`}>
                <h2 className="mb-3 text-base font-bold">Valuation log</h2>
                {log.length === 0 ? (
                    <p className="text-sm text-slate-600">Nothing yet. Every valuation run appears here for all members.</p>
                ) : (
                    <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                            <tr>
                                <th className={th}>Valuation date</th>
                                <th className={th}>Status</th>
                                <th className={`${th} text-right`}>Orders filled</th>
                                <th className={`${th} text-right`}>NAV</th>
                                <th className={`${th} text-right`}>Cash</th>
                            </tr>
                        </thead>
                        <tbody>
                            {log.map((r, i) => (
                                <tr key={i}>
                                    <td className={`${td} whitespace-nowrap`}>{r.at ? stamp(r.at) : shortDate(r.date)}</td>
                                    <td className={`${td} font-semibold ${r.status === 'SUCCESS' ? 'text-green-700' : 'text-red-700'}`}>{r.status === 'SUCCESS' ? 'Success' : r.status}</td>
                                    <td className={`${td} text-right`}>{r.filledOrderIds.length}</td>
                                    <td className={`${td} text-right`}>{usd(r.navCents)}</td>
                                    <td className={`${td} text-right`}>{usd(r.cashCents)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}

export default function ValuationPage() {
    return <Shell><Valuation /></Shell>;
}
