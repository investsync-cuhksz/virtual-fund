// The backend is the default. Set NEXT_PUBLIC_USE_MOCK=true to preview with browser-only data.
import * as mock from './mock-data';
import { usd } from './format';
import type { Check, Dashboard, DecisionRequest, Instrument, NewOrder, Order, OrderStatus, Preview, Side, ValuationRun } from './types';

// const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
const USE_MOCK = 'true';

export class ApiError extends Error {
  status: number; code: string; checks?: Check[];
  constructor(status: number, code: string, message: string, checks?: Check[]) {
    super(message); this.status = status; this.code = code; this.checks = checks;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'Something went wrong.', body?.checks);
  return body as T;
}
const post = <T>(url: string, data: unknown) => call<T>(url, { method: 'POST', body: JSON.stringify(data) });

// ---- mock backend (display only) ----
const STORE = 'mock-fund-v1';
const saved: { orders?: Order[]; valuationLog?: ValuationRun[]; asOf?: string } | null = (() => {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(STORE) ?? 'null'); } catch { return null; }
})();
let orders: Order[] = saved?.orders ?? [...mock.orders];
let valuationLog: ValuationRun[] = saved?.valuationLog ?? []; // newest first
const NAV = mock.dashboardStart.fund.navCents;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
// Mock only: whole shares at fixed closing prices (in cents) with a 0.10% fee. The real server does this.
const PRICES: Record<string, number> = { AAPL: 20000, MSFT: 40000, JPM: 25000, JNJ: 20000, XOM: 11000 };
let asOf: string = saved?.asOf ?? '2026-11-05';

// Mock only: whole shares at the fixed prices above. Buys and sells.
function fillTrades() {
  return orders
    .filter((o) => o.status === 'FILLED' && o.fill?.date)
    .map((o) => {
      const price = PRICES[o.instrument.ticker];
      const shares = Math.floor(o.requestedAmountCents / price);
      const sign = o.side === 'SELL' ? -1 : 1;
      return { o, price, shares, qty: sign * shares, value: sign * shares * price, fee: Math.round(shares * price * 0.001) };
    });
}

// Shares of a ticker the fund holds, and how many are still free after pending and approved sell orders.
function sellable(ticker: string) {
  const held = fillTrades().filter((t) => t.o.instrument.ticker === ticker).reduce((s, t) => s + t.qty, 0);
  const reserved = orders
    .filter((o) => (o.status === 'PENDING' || o.status === 'APPROVED') && o.side === 'SELL' && o.instrument.ticker === ticker)
    .reduce((s, o) => s + Math.floor(o.requestedAmountCents / PRICES[ticker]), 0);
  return { held, free: held - reserved };
}

function buildDash(): Dashboard {
  const start = NAV;
  const trades = fillTrades();
  const cash = start - trades.reduce((s, t) => s + t.value + t.fee, 0);
  const nav = cash + trades.reduce((s, t) => s + t.value, 0);
  const commitments = orders
    .filter((o) => (o.status === 'PENDING' || o.status === 'APPROVED') && o.side === 'BUY')
    .reduce((s, o) => s + o.requestedAmountCents, 0);
  const w = (c: number) => (c / nav) * 100;

  const byTicker = new Map<string, { name: string; sector: string; price: number; quantity: number }>();
  trades.forEach((t) => {
    const k = t.o.instrument.ticker;
    byTicker.set(k, { name: t.o.instrument.name, sector: t.o.instrument.sector, price: t.price, quantity: (byTicker.get(k)?.quantity ?? 0) + t.qty });
  });
  const held = [...byTicker].filter(([, h]) => h.quantity > 0);
  const holdings = held.map(([ticker, h]) => ({
    ticker, name: h.name, quantity: h.quantity, lastPriceCents: h.price,
    valueCents: h.quantity * h.price, weightPercent: w(h.quantity * h.price), returnPercent: 0,
  }));
  const sectors = new Map<string, number>();
  held.forEach(([, h]) => sectors.set(h.sector, (sectors.get(h.sector) ?? 0) + w(h.quantity * h.price)));

  const fund = (nav / start - 1) * 100;
  const bench = trades.length ? 0.1 : 0;
  return {
    asOf,
    fund: { baseCurrency: 'USD', navCents: nav, cashCents: cash, freeCashCents: cash - commitments },
    performance: { fundSinceStartPercent: fund, benchmarkName: 'S&P 500', benchmarkSinceStartPercent: bench, excessSinceStartPercent: fund - bench },
    chart: trades.length
      ? [{ date: mock.dashboardStart.asOf, fundIndex: 100, benchmarkIndex: 100 }, { date: asOf, fundIndex: (nav / start) * 100, benchmarkIndex: 100.1 }]
      : [{ date: asOf, fundIndex: 100, benchmarkIndex: 100 }],
    holdings,
    sectorBreakdown: [...[...sectors].map(([sector, weightPercent]) => ({ sector, weightPercent })), { sector: 'Cash', weightPercent: w(cash) }],
    recentTrades: trades.map((t) => ({
      id: `trade_${t.o.id.slice(4)}`, date: t.o.fill!.date!, type: 'FILL', ticker: t.o.instrument.ticker, side: t.o.side,
      quantity: t.shares, priceCents: t.price, feeCents: t.fee, orderId: t.o.id, pitch: t.o.pitch,
      executedAt: t.o.fill!.at ?? null,
    })),
  };
}

function mockPreview(ticker: string, size: number, side: Side = 'BUY'): Preview {
  const i = mock.instruments.find((x) => x.ticker === ticker);
  if (!i) throw new ApiError(404, 'UNKNOWN_INSTRUMENT', 'That ticker is not in the fund list.');
  const amount = Math.round((NAV * size) / 100);
  if (side === 'SELL') {
    const shares = Math.floor(amount / PRICES[ticker]);
    const { held, free } = sellable(ticker);
    const checks: Check[] = [
      { code: 'POSITION_LIMIT', label: 'Position weight (a sale lowers it)', status: 'NA' },
      { code: 'SECTOR_LIMIT', label: `${i.sector} sector (a sale lowers it)`, status: 'NA' },
      { code: 'CASH', label: 'Cash (a sale adds cash)', status: 'NA' },
      { code: 'SHARES_HELD', label: `Shares to sell: ${shares} (${free} available of ${held} held)`, status: shares >= 1 && shares <= free ? 'PASS' : 'FAIL' },
      { code: 'INSTRUMENT_TYPE', label: 'Instrument type allowed (stock)', status: 'PASS' },
    ];
    return { allowed: checks.every((c) => c.status !== 'FAIL'), estimatedAmountCents: amount, checks };
  }
  const checks: Check[] = [
    { code: 'POSITION_LIMIT', label: `Position weight ${size.toFixed(1)}% (limit 10%)`, status: size > 10 ? 'FAIL' : 'PASS' },
    { code: 'SECTOR_LIMIT', label: `${i.sector} ${size.toFixed(1)}% (limit 30%)`, status: size > 30 ? 'FAIL' : 'PASS' },
    { code: 'CASH', label: `Cash available for ${usd(amount)}`, status: 'PASS' },
    { code: 'SHARES_HELD', label: 'Shares held to sell', status: 'NA' },
    { code: 'INSTRUMENT_TYPE', label: 'Instrument type allowed (stock)', status: 'PASS' },
  ];
  return { allowed: checks.every((c) => c.status !== 'FAIL'), estimatedAmountCents: amount, checks };
}

// ---- API functions ----
// Tells the header (and anything else listening) that orders changed.
const changed = () => {
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(STORE, JSON.stringify({ orders, valuationLog, asOf })); } catch { /* storage full or blocked */ }
    window.dispatchEvent(new Event('orders-changed'));
  }
};

export async function searchInstruments(q: string): Promise<Instrument[]> {
  if (!USE_MOCK) return (await call<{ instruments: Instrument[] }>(`/api/instruments?q=${encodeURIComponent(q)}`)).instruments;
  const s = q.trim().toLowerCase();
  return mock.instruments.filter((i) => !s || i.ticker.toLowerCase().includes(s) || i.name.toLowerCase().includes(s));
}

export async function previewOrder(b: { ticker: string; side: Side; sizePercent: number }): Promise<Preview> {
  return USE_MOCK ? mockPreview(b.ticker, b.sizePercent, b.side) : post('/api/orders/preview', b);
}

export async function createOrder(b: NewOrder): Promise<{ order: Order }> {
  if (!USE_MOCK) {
    const r = await post<{ order: Order }>('/api/orders', b);
    changed();
    return r;
  }
  const p = mockPreview(b.ticker, b.sizePercent, b.side);
  if (!p.allowed) {
    const bad = p.checks.find((c) => c.status === 'FAIL');
    throw new ApiError(422, 'MANDATE_VIOLATION', b.side === 'SELL' ? (bad?.label ?? 'Cannot sell this amount.') : `Would bring ${b.ticker} to ${b.sizePercent.toFixed(1)}% of NAV; limit is 10%.`, p.checks);
  }
  const order: Order = {
    id: `ord_${String(orders.length + 1).padStart(3, '0')}`, createdAt: new Date().toISOString(),
    instrument: mock.instruments.find((i) => i.ticker === b.ticker)!, side: b.side, sizePercent: b.sizePercent,
    requestedAmountCents: p.estimatedAmountCents, pitch: b.pitch, rationale: b.rationale,
    submittedBy: { id: b.actorId, name: cap(b.actorId) }, status: 'PENDING', decision: null, fill: null,
  };
  orders = [order, ...orders];
  changed();
  return { order };
}

export async function listOrders(): Promise<Order[]> {
  return USE_MOCK ? orders : (await call<{ orders: Order[] }>('/api/orders')).orders;
}

export async function decideOrder(id: string, b: DecisionRequest): Promise<Order> {
  if (!USE_MOCK) {
    const o = (await post<{ order: Order }>(`/api/orders/${id}/decision`, b)).order;
    changed();
    return o;
  }
  const o = orders.find((x) => x.id === id);
  if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  if (o.status !== 'PENDING') throw new ApiError(409, 'INVALID_STATUS', 'This order is no longer pending.');
  const mine = o.submittedBy.id === b.actorId;
  if (b.action === 'CANCEL' && !mine) throw new ApiError(403, 'NOT_SUBMITTER', 'Only the person who submitted an order can cancel it.');
  if (b.action !== 'CANCEL' && mine) throw new ApiError(403, 'SELF_APPROVAL', 'You cannot approve your own order.');
  if (b.action !== 'APPROVE' && !b.reason?.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'Enter a reason.');
  const status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' }[b.action] as OrderStatus;
  const updated: Order = { ...o, status, decision: { action: b.action, by: { id: b.actorId, name: cap(b.actorId) }, at: new Date().toISOString(), reason: b.reason?.trim() || null } };
  orders = orders.map((x) => (x.id === id ? updated : x));
  changed();
  return updated;
}

export async function runValuation(date: string): Promise<ValuationRun> {
  if (!USE_MOCK) {
    const r = (await post<{ run: ValuationRun }>('/api/valuation', { date })).run;
    changed();
    return r;
  }
  const at = `${date}T${new Date().toISOString().slice(11)}`;
  const ready = orders.filter((o) => o.status === 'APPROVED');
  if (ready.length > 0) {
    orders = orders.map((o) => (o.status === 'APPROVED' ? { ...o, status: 'FILLED' as OrderStatus, fill: { date, at } } : o));
    asOf = date;
  }
  const d = buildDash();
  const run: ValuationRun = { date, status: 'SUCCESS', filledOrderIds: ready.map((o) => o.id), navCents: d.fund.navCents, cashCents: d.fund.cashCents, at };
  // Only runs that fill something are logged
  if (ready.length > 0) {
    valuationLog = [run, ...valuationLog];
    changed();
  }
  return run;
}

export async function listValuationRuns(): Promise<ValuationRun[]> {
  return USE_MOCK ? valuationLog : (await call<{ runs: ValuationRun[] }>('/api/valuation')).runs;
}

export async function getDashboard(): Promise<Dashboard> {
  const d = USE_MOCK ? buildDash() : await call<Dashboard>('/api/dashboard');
  const t = (r: Dashboard['recentTrades'][number]) => r.executedAt ?? r.date;
  const recentTrades = d.recentTrades
    .map((r, i) => ({ r, i }))
    .sort((a, b) => t(b.r).localeCompare(t(a.r)) || b.i - a.i)
    .map((x) => x.r);
  return { ...d, recentTrades };
}

// Every ledger row, newest first. The backend returns all fills in recentTrades.
// If Angelo adds a dedicated ledger route later, change only this function.
export async function listLedger(): Promise<Dashboard['recentTrades']> {
  return (await getDashboard()).recentTrades;
}