'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell, { useActor } from '@/components/Shell';
import { card, field, outline, primary } from '@/components/ui';
import { ApiError, createOrder, getDashboard, previewOrder, searchInstruments } from '@/lib/api';
import { pct, usd } from '@/lib/format';
import type { Dashboard, Instrument, Preview, Side } from '@/lib/types';

function OrderForm() {
  const actorId = useActor();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [sel, setSel] = useState<Instrument | null>(null);
  const [side, setSide] = useState<Side>('BUY');
  const [size, setSize] = useState('6');
  const [pitch, setPitch] = useState('');
  const [why, setWhy] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const isSell = side === 'SELL';
  const fund = dash?.fund;
  const n = Number(size);
  const sizeOk = /^\d+(\.\d{1,2})?$/.test(size.trim()) && n > 0;
  const failed = preview?.checks.find((c) => c.status === 'FAIL');
  const holding = sel ? dash?.holdings.find((h) => h.ticker === sel.ticker) : undefined;

  useEffect(() => { getDashboard().then(setDash).catch(() => { }); }, [msg]);

  useEffect(() => {
    const t = setTimeout(() => { searchInstruments(q).then(setResults).catch(() => setResults([])); }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!sel || !sizeOk) return;
    let live = true;
    const t = setTimeout(() => {
      previewOrder({ ticker: sel.ticker, side, sizePercent: n })
        .then((p) => { if (live) setPreview(p); })
        .catch((e) => {
          if (!live) return;
          setPreview(null);
          setMsg({ ok: false, text: e instanceof ApiError && e.code === 'UNSUPPORTED_SIDE' ? 'Sell orders are not available yet.' : e.message });
        });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [sel, side, size, sizeOk, n]);

  function changeSide(s: Side) { setSide(s); setPreview(null); setMsg(null); }

  function clear() { setSel(null); setPreview(null); setQ(''); setSide('BUY'); setSize('6'); setPitch(''); setWhy(''); setMsg(null); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sel || !preview?.allowed) return;
    setBusy(true); setMsg(null);
    try {
      const { order } = await createOrder({ actorId, ticker: sel.ticker, side, sizePercent: n, pitch: pitch.trim(), rationale: why.trim() });
      clear();
      setMsg({ ok: true, text: `Order ${order.id} saved as Pending. A second committee member must approve it.` });
    } catch (err) {
      if (err instanceof ApiError && err.checks) setPreview({ allowed: false, estimatedAmountCents: preview.estimatedAmountCents, checks: err.checks });
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save the order.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Enter an order</h1>
        <p className="mt-1 text-slate-600">Saved as Pending. A second committee member must approve it before it fills at the next trading day&apos;s close.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className={`${card} space-y-5`}>
          <div>
            <label htmlFor="q" className="text-sm font-semibold">Instrument (search by ticker or company)</label>
            {sel ? (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm">
                <span className="font-semibold text-blue-900">{sel.ticker} {sel.name} · {sel.exchange} · {sel.currency} · {sel.sector}</span>
                <button type="button" onClick={() => { setSel(null); setPreview(null); }} className="font-semibold text-blue-800 underline">Change</button>
              </div>
            ) : (
              <>
                <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or company name (e.g. AAPL, Apple)" className={field} />
                <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {results.length === 0 && <li className="px-3 py-3 text-sm text-slate-600">No instrument matches that search.</li>}
                  {results.map((i) => (
                    <li key={i.ticker}>
                      <button type="button" onClick={() => { setSel(i); setPreview(null); }} className="grid min-h-11 w-full grid-cols-[4rem_1fr_auto] items-center gap-3 px-3 text-left text-sm hover:bg-blue-50">
                        <span className="font-semibold">{i.ticker}</span>
                        <span>{i.name}</span>
                        <span className="text-slate-600">{i.exchange} · {i.sector}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <span className="text-sm font-semibold">Side</span>
              <div className="mt-1 flex gap-2" role="group" aria-label="Side">
                <button type="button" aria-pressed={!isSell} onClick={() => changeSide('BUY')} className={!isSell ? primary : outline}>Buy</button>
                <button type="button" aria-pressed={isSell} onClick={() => changeSide('SELL')} className={isSell ? primary : outline}>Sell</button>
              </div>
            </div>
            <div>
              <label htmlFor="size" className="text-sm font-semibold">{isSell ? 'Amount to sell (% of NAV)' : 'Size (% of NAV)'}</label>
              <input id="size" inputMode="decimal" value={size} onChange={(e) => { setSize(e.target.value); setPreview(null); }} placeholder="e.g. 6" aria-invalid={!sizeOk} className={field} />
              <p className="mt-1 text-xs text-slate-600">
                {!sizeOk ? 'Enter a size above 0, with up to 2 decimals.' : preview ? `About ${usd(preview.estimatedAmountCents)}${isSell ? ' to sell' : ''}` : 'Pick an instrument to see the amount.'}
              </p>
              {isSell && sel && (
                <p className="mt-1 text-xs font-semibold text-slate-700">
                  {holding ? `The fund holds ${holding.quantity} shares (${usd(holding.valueCents)}, ${pct(holding.weightPercent)} of NAV).` : 'The fund holds no shares of this stock.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="pitch" className="text-sm font-semibold">Linked pitch</label>
            <input id="pitch" required value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="Enter the pitch this order is based on" className={field} />
          </div>
          <div>
            <label htmlFor="why" className="text-sm font-semibold">Rationale (required)</label>
            <textarea id="why" required rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why are you making this trade?" className={`${field} py-2`} />
          </div>

          {failed && <p role="alert" className="rounded-lg border border-red-700 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">Order blocked: {failed.label}</p>}
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${msg.ok ? 'border-green-700 bg-green-50 text-green-900' : 'border-red-700 bg-red-50 text-red-800'}`}>
              {msg.text} {msg.ok && <Link href="/orders" className="underline">View orders</Link>}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={clear} className={outline}>Clear</button>
            <button type="submit" disabled={busy || !preview?.allowed || !pitch.trim() || !why.trim()} className={primary}>{busy ? 'Saving…' : isSell ? 'Submit sell order' : 'Submit buy order'}</button>
          </div>
        </form>

        <div className="space-y-6">
          <section aria-label="Fund now" className={card}>
            <div className="grid grid-cols-3 gap-3">
              {([['NAV', fund?.navCents], ['Cash', fund?.cashCents], ['Free cash*', fund?.freeCashCents]] as const).map(([label, v]) => (
                <div key={label}>
                  <div className="text-xs text-slate-600">{label}</div>
                  <div className="text-base font-bold">{v === undefined ? '…' : usd(v)}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-600">*Free cash = cash minus pending and approved buy orders.</p>
          </section>

          <section aria-label="Mandate checks" className={card}>
            <h2 className="text-base font-bold">Mandate checks (live preview)</h2>
            {preview ? (
              <ul className="mt-2">
                {preview.checks.map((c) => (
                  <li key={c.code} className="flex items-center justify-between gap-4 border-b border-slate-200 py-3 text-sm last:border-b-0">
                    <span>{c.label}</span>
                    <span className={`font-bold ${c.status === 'PASS' ? 'text-green-700' : c.status === 'FAIL' ? 'text-red-700' : 'text-slate-600'}`}>
                      {c.status === 'PASS' ? 'Pass' : c.status === 'FAIL' ? 'Fail' : 'n/a'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Pick an instrument and a size to see the five checks.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function EnterOrderPage() {
  return <Shell><OrderForm /></Shell>;
}
