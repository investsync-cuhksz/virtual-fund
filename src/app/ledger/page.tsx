'use client';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { card, td, th } from '@/components/ui';
import { listLedger } from '@/lib/api';
import { shortDate, stamp, usd } from '@/lib/format';
import type { Dashboard } from '@/lib/types';

type Row = Dashboard['recentTrades'][number];
const TYPE_LABEL: Record<string, string> = { FILL: 'Fill', DIVIDEND: 'Dividend', SPLIT: 'Split', CORRECTION: 'Correction' };
const label = (t: string) => TYPE_LABEL[t] ?? t[0] + t.slice(1).toLowerCase();

function Ledger() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [type, setType] = useState('ALL');

  useEffect(() => {
    listLedger().then(setRows).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the ledger.'));
  }, []);

  const list = rows ?? [];
  const types = [...new Set(list.map((r) => r.type))];
  const shown = type === 'ALL' ? list : list.filter((r) => r.type === type);
  const count = (t: string) => (t === 'ALL' ? list.length : list.filter((r) => r.type === t).length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Trade ledger</h1>
          <p className="mt-1 text-slate-600">Every fill is its own row, newest first. Nothing is edited or deleted.</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">Append-only · rows can&apos;t be edited or deleted</span>
      </div>

      {types.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {['ALL', ...types].map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${type === t ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
              {t === 'ALL' ? 'All' : label(t) + 's'} {count(t)}
            </button>
          ))}
        </div>
      )}

      {err && <p role="alert" className="rounded-lg border border-red-700 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">{err}</p>}

      <div className={`${card} overflow-x-auto`}>
        {rows === null && !err ? <p className="text-sm text-slate-600">Loading the ledger…</p> : shown.length === 0 ? (
          <p className="text-sm text-slate-600">No ledger rows yet. Approve an order, then run the valuation on the Valuation page.</p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Type</th>
                <th className={th}>Instrument</th>
                <th className={th}>Side</th>
                <th className={th}>Qty</th>
                <th className={th}>Price</th>
                <th className={th}>Fee</th>
                <th className={th}>Order</th>
                <th className={th}>Pitch</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap`}>{r.executedAt ? stamp(r.executedAt) : shortDate(r.date)}</td>
                  <td className={td}>{label(r.type)}</td>
                  <td className={`${td} font-semibold`}>{r.ticker}</td>
                  <td className={`${td} font-semibold ${r.side === 'BUY' ? 'text-green-700' : 'text-red-700'}`}>{r.side === 'BUY' ? 'Buy' : 'Sell'}</td>
                  <td className={td}>{r.quantity}</td>
                  <td className={td}>{usd(r.priceCents)}</td>
                  <td className={td}>{usd(r.feeCents)}</td>
                  <td className={td}>{r.orderId.replace('ord_', '#')}</td>
                  <td className={td}>{r.pitch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows !== null && rows.length > 0 && <p className="text-sm text-slate-600">{shown.length} row(s)</p>}
    </div>
  );
}

export default function LedgerPage() {
  return <Shell><Ledger /></Shell>;
}
