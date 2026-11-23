'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell, { useActor } from '@/components/Shell';
import { card, field, outline, primary } from '@/components/ui';
import { ApiError, createOrder, getDashboard, previewOrder, searchInstruments } from '@/lib/api';
import { pct, usd } from '@/lib/format';
import type { Dashboard, Instrument, Preview, Side } from '@/lib/types';

type Mode = 'PERCENT' | 'AMOUNT';
const MONEY = /^\d+(\.\d{1,2})?$/;

function OrderForm() {
  const actorId = useActor();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [sel, setSel] = useState<Instrument | null>(null);
  const [side, setSide] = useState<Side>('BUY');
  const [mode, setMode] = useState<Mode>('PERCENT');
  const [size, setSize] = useState('6');
  const [pitch, setPitch] = useState('');
  const [why, setWhy] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const isSell = side === 'SELL';
  const byAmount = mode === 'AMOUNT';
  const fund = dash?.fund;
  const clean = size.replace(/[,$\s]/g, '');
  const sizeOk = byAmount ? MONEY.test(clean) && Number(clean) > 0 : MONEY.test(size.trim()) && Number(size) > 0;
  const n = byAmount ? 0 : Number(size);
  const amountUsd = byAmount && sizeOk ? Number(clean) : 0; // dollars, as typed
  const failed = preview?.checks.find((c) => c.status === 'FAIL');
  const holding = sel ? dash?.holdings.find((h) => h.ticker === sel.ticker) : undefined;
  // Shares the fund owns per ticker. Selling only offers stocks the fund owns.
  const owned = new Map((dash?.holdings ?? []).filter((h) => h.quantity > 0).map((h) => [h.ticker, h.quantity]));
  const options = isSell ? results.filter((i) => owned.has(i.ticker)) : results;

  useEffect(() => { getDashboard().then(setDash).catch(() => { }); }, [msg]);

  // Selling: the server only lists instruments the fund can actually sell, with the shares still free to sell.
  useEffect(() => {
    const t = setTimeout(() => { searchInstruments(q, isSell).then(setResults).catch(() => setResults([])); }, 200);
    return () => clearTimeout(t);
  }, [q, isSell, msg]);

  useEffect(() => {
    if (!sel || !sizeOk) return;
    let live = true;
    const t = setTimeout(() => {
      previewOrder({ ticker: sel.ticker, side, ...(byAmount ? { amountUsd } : { sizePercent: n }) })
        .then((p) => { if (live) { setPreview(p); setMax(p.maxAmountCents ?? null); } })
        .catch((e) => { if (live) { setPreview(null); setMsg({ ok: false, text: e.message }); } });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [sel, side, byAmount, sizeOk, n, amountUsd]);

  function pick(i: Instrument) { setSel(i); setPreview(null); setMax(null); setMsg(null); setNote(''); }
  // Side sits below the instrument. Choosing Sell keeps the picked stock only if the fund can sell it;
  // otherwise the pick is cleared and the list above shows just the holdings that can be sold.
  async function changeSide(s: Side) {
    if (s === side) return;
    setSide(s); setPreview(null); setMax(null); setMsg(null); setNote(''); setQ('');
    if (s === 'SELL' && sel) {
      const d = dash ?? await getDashboard().catch(() => null);
      if (!d?.holdings.some((h) => h.ticker === sel.ticker && h.quantity > 0)) {
        setSel(null);
        setNote(`${sel.ticker} is not one of the fund's holdings, so it can't be sold. Pick one of the stocks listed.`);
      }
    }
  }

  function changeMode(m: Mode) {
    if (m === mode) return;
    // Carry the current figure across so the order does not silently change size.
    if (sizeOk && fund) {
      if (m === 'AMOUNT') setSize((Math.round(fund.navCents * n / 100) / 100).toFixed(2));
      else setSize((Math.round(amountUsd * 100 / fund.navCents * 10_000) / 100).toFixed(2));
    } else setSize('');
    setMode(m); setPreview(null); setMsg(null);
  }

  function applyMax() {
    if (max === null || !fund) return;
    // Percent mode rounds down to 2 decimals so the order never goes over the limit.
    setSize(byAmount ? (max / 100).toFixed(2) : (Math.floor(max / fund.navCents * 10_000) / 100).toFixed(2));
    setPreview(null); setMsg(null);
  }

  function clear() { setSel(null); setPreview(null); setMax(null); setQ(''); setNote(''); setSide('BUY'); setMode('PERCENT'); setSize('6'); setPitch(''); setWhy(''); setMsg(null); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sel || !preview?.allowed) return;
    setBusy(true); setMsg(null);
    try {
      const { order } = await createOrder({ actorId, ticker: sel.ticker, side, ...(byAmount ? { amountUsd } : { sizePercent: n }), pitch: pitch.trim(), rationale: why.trim() });
      clear();
      setMsg({ ok: true, text: `Order ${order.id} saved as Pending. A second committee member must approve it.` });
    } catch (err) {
      if (err instanceof ApiError && err.checks) setPreview({ allowed: false, estimatedAmountCents: preview.estimatedAmountCents, checks: err.checks });
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save the order.' });
    } finally { setBusy(false); }
  }

  const sizeHelp = !sizeOk
    ? (byAmount ? 'Enter an amount above 0, up to 2 decimals.' : 'Enter a size above 0, with up to 2 decimals.')
    : preview
      ? (byAmount ? `About ${pct(preview.sizePercent ?? 0, 2)} of NAV` : `About ${usd(preview.estimatedAmountCents)}${isSell ? ' to sell' : ''}`)
      : 'Pick an instrument to see the result.';
  const maxLabel = isSell ? 'Max sell' : 'Max buy';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Enter an order</h1>
        <p className="mt-1 text-slate-600">Saved as Pending. A second committee member must approve it before it fills at the next trading day&apos;s close.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className={`${card} space-y-5`}>
          <div>
            <label htmlFor="q" className="text-sm font-semibold">{isSell ? 'Instrument to sell (only stocks the fund owns)' : 'Instrument (search by ticker or company)'}</label>
            {note && !sel && <p role="alert" className="mt-1 rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{note}</p>}
            {sel ? (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm">
                <span className="font-semibold text-blue-900">{sel.ticker} {sel.name} · {sel.exchange} · {sel.currency} · {sel.sector}</span>
                <button type="button" onClick={() => { setSel(null); setPreview(null); setMax(null); }} className="font-semibold text-blue-800 underline">Change</button>
              </div>
            ) : (
              <>
                <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={isSell ? 'Search the stocks you own (e.g. AAPL)' : 'Search ticker or company name (e.g. AAPL, Apple)'} className={field} />
                <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {options.length === 0 && (
                    <li className="px-3 py-3 text-sm text-slate-600">
                      {!isSell ? 'No instrument matches that search.' : !dash ? 'Loading the fund\u2019s holdings…' : owned.size === 0 ? 'The fund owns nothing to sell yet. Shares can be sold once a buy order has filled.' : 'None of the stocks the fund owns match that search.'}
                    </li>
                  )}
                  {options.map((i) => (
                    <li key={i.ticker}>
                      <button type="button" onClick={() => pick(i)} className="grid min-h-11 w-full grid-cols-[4rem_1fr_auto] items-center gap-3 px-3 text-left text-sm hover:bg-blue-50">
                        <span className="font-semibold">{i.ticker}</span>
                        <span>{i.name}</span>
                        <span className="text-slate-600">
                          {isSell
                            ? `${(owned.get(i.ticker) ?? 0).toLocaleString('en-US')} ${owned.get(i.ticker) === 1 ? 'share' : 'shares'}${i.sellableShares !== undefined && i.sellableShares < (owned.get(i.ticker) ?? 0) ? ` · ${i.sellableShares.toLocaleString('en-US')} free` : ''}`
                            : `${i.exchange} · ${i.sector}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div>
            <span className="text-sm font-semibold">Side</span>
            <div className="mt-1 flex gap-2" role="group" aria-label="Side">
              <button type="button" aria-pressed={!isSell} onClick={() => changeSide('BUY')} className={!isSell ? primary : outline}>Buy</button>
              <button type="button" aria-pressed={isSell} onClick={() => changeSide('SELL')} className={isSell ? primary : outline}>Sell</button>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <span className="text-sm font-semibold">{isSell ? 'Amount to sell' : 'Order size'}</span>
              <div className="flex gap-2" role="group" aria-label="Size unit">
                <button type="button" aria-pressed={!byAmount} onClick={() => changeMode('PERCENT')} className={!byAmount ? primary : outline}>% of NAV</button>
                <button type="button" aria-pressed={byAmount} onClick={() => changeMode('AMOUNT')} className={byAmount ? primary : outline}>USD amount</button>
              </div>
            </div>
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                {byAmount && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600">$</span>}
                <input id="size" aria-label={byAmount ? 'Order amount in US dollars' : 'Order size as percent of NAV'} inputMode="decimal" value={size} onChange={(e) => { setSize(e.target.value); setPreview(null); }} placeholder={byAmount ? 'e.g. 60000' : 'e.g. 6'} aria-invalid={!sizeOk} className={`${field} !mt-0 ${byAmount ? 'pl-7' : ''}`} />
              </div>
              <button type="button" onClick={applyMax} disabled={max === null || max <= 0 || !fund} className={outline}>{maxLabel}</button>
            </div>
            <p className="mt-1 text-xs text-slate-600">{sizeHelp}</p>
            {sel && max !== null && (
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {max > 0
                  ? `${maxLabel}: ${usd(max)}${fund ? ` (${pct(max / fund.navCents * 100, 2)} of NAV)` : ''}${isSell ? '' : ', limited by the position, sector and cash rules'}.`
                  : isSell ? 'Nothing is available to sell for this stock.' : 'No room left to buy this stock under the position, sector or cash rules.'}
              </p>
            )}
            {isSell && sel && (
              <p className="mt-1 text-xs text-slate-700">
                {holding ? `The fund holds ${holding.quantity.toLocaleString('en-US')} shares (${usd(holding.valueCents)}, ${pct(holding.weightPercent)} of NAV).` : ''}
                {sel.sellableShares !== undefined && holding && sel.sellableShares < holding.quantity ? ` ${sel.sellableShares.toLocaleString('en-US')} are free; the rest are reserved by other pending sells.` : ''}
                {' '}Sells fill at the next close for whole shares, and never more than the fund holds.
              </p>
            )}
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
