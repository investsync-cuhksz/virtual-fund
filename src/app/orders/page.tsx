'use client';
import { useEffect, useState } from 'react';
import Shell, { useActor } from '@/components/Shell';
import { card, danger, field, green, outline } from '@/components/ui';
import { decideOrder, listOrders } from '@/lib/api';
import { shortDate, stamp, usd } from '@/lib/format';
import type { DecisionAction, Order, OrderStatus } from '@/lib/types';

const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'FILLED', 'REJECTED', 'CANCELLED'] as const;
const BADGE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-900', APPROVED: 'bg-blue-100 text-blue-900', FILLED: 'bg-green-100 text-green-900',
  REJECTED: 'bg-red-100 text-red-900', CANCELLED: 'bg-slate-200 text-slate-700',
};
const VERB = { APPROVE: 'Approved', REJECT: 'Rejected', CANCEL: 'Cancelled' };
const head = 'py-2 pr-3 text-xs font-semibold text-slate-600';
const cell = 'border-t border-slate-200 py-2.5 pr-3 align-middle break-words';

function note(o: Order) {
  if (!o.decision) return '';
  const filled = o.status === 'FILLED' && o.fill?.date ? ` · filled ${shortDate(o.fill.date)}` : '';
  return `${VERB[o.decision.action]} by ${o.decision.by.name}${o.decision.reason ? ': ' + o.decision.reason : ''}${filled}`;
}

function OrderList() {
  const actorId = useActor();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [err, setErr] = useState('');
  const [dlg, setDlg] = useState<{ order: Order; action: 'REJECT' | 'CANCEL' } | null>(null);
  const [reason, setReason] = useState('');

  const load = () => { listOrders().then(setOrders).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);

  async function decide(o: Order, action: DecisionAction, why?: string) {
    setErr('');
    try {
      await decideOrder(o.id, { actorId, action, reason: why });
      setDlg(null); setReason(''); load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The decision could not be saved.');
    }
  }

  const list = orders ?? [];
  const count = (f: string) => (f === 'ALL' ? list.length : list.filter((o) => o.status === f).length);
  const shown = filter === 'ALL' ? list : list.filter((o) => o.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="mt-1 text-slate-600">Nobody can approve their own order. The approver and time are recorded.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === f ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
            {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()} {count(f)}
          </button>
        ))}
      </div>

      {err && <p role="alert" className="rounded-lg border border-red-700 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">{err}</p>}

      <div className={`${card} overflow-x-auto`}>
        {orders === null ? <p className="text-sm text-slate-600">Loading orders…</p> : shown.length === 0 ? (
          <p className="text-sm text-slate-600">No orders here yet. Enter one on the Enter order screen.</p>
        ) : (
                    <table className="w-full table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[4%]" /><col className="w-[10%]" /><col className="w-[13%]" /><col className="w-[12%]" />
              <col className="w-[11%]" /><col className="w-[16%]" /><col className="w-[6%]" /><col className="w-[8%]" /><col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={head}>#</th><th className={head}>Created</th><th className={head}>Instrument</th><th className={head}>Size</th>
                <th className={head}>Pitch</th><th className={head}>Rationale</th><th className={head}>By</th><th className={head}>Status</th>
                <th className={head}>Action / approver</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const mine = o.submittedBy.id === actorId;
                return (
                  <tr key={o.id}>
                    <td className={cell}>{o.id.replace('ord_', '#')}</td>
                    <td className={cell}>{stamp(o.createdAt)}</td>
                    <td className={cell}><b>{o.instrument.ticker}</b> {o.instrument.name}</td>
                    <td className={cell}>{o.side === 'BUY' ? 'Buy' : 'Sell'} {o.sizePercent}% ≈ {usd(o.requestedAmountCents)}</td>
                    <td className={cell}>{o.pitch}</td>
                    <td className={`${cell} text-slate-700`}>{o.rationale}</td>
                    <td className={cell}>{o.submittedBy.name}{mine ? ' (you)' : ''}</td>
                    <td className={cell}><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${BADGE[o.status]}`}>{o.status[0] + o.status.slice(1).toLowerCase()}</span></td>
                    <td className={cell}>
                      {o.status === 'PENDING' && !mine && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => decide(o, 'APPROVE')} className={green}>Approve</button>
                          <button type="button" onClick={() => setDlg({ order: o, action: 'REJECT' })} className={danger}>Reject…</button>
                        </div>
                      )}
                      {o.status === 'PENDING' && mine && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-amber-800">Can&apos;t approve your own order</span>
                          <button type="button" onClick={() => setDlg({ order: o, action: 'CANCEL' })} className={danger}>Cancel…</button>
                        </div>
                      )}
                      {o.status !== 'PENDING' && <span className="text-slate-700">{note(o)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dlg && (
        <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={(e) => { e.preventDefault(); decide(dlg.order, dlg.action, reason); }} className={`${card} w-full max-w-md space-y-4`}>
            <h2 id="dlg-title" className="text-lg font-bold">{dlg.action === 'REJECT' ? 'Reject' : 'Cancel'} order {dlg.order.id.replace('ord_', '#')}</h2>
            <div>
              <label htmlFor="reason" className="text-sm font-semibold">Reason (required)</label>
              <textarea id="reason" required autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} py-2`} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setDlg(null); setReason(''); }} className={outline}>Keep order</button>
              <button type="submit" disabled={!reason.trim()} className={danger}>{dlg.action === 'REJECT' ? 'Reject order' : 'Cancel order'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
    return <Shell wide><OrderList /></Shell>;
}
