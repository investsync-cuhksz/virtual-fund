import 'server-only';

import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { instruments } from './mock-data';
import type { Check, Dashboard, DecisionAction, DecisionRequest, Instrument, NewOrder, Order, Preview, ValuationRun } from './types';

const START_CENTS = 100_000_000;
const START_DATE = '2026-11-04';
const FEE_RATE = 0.001;
const PEOPLE = new Map([['kellen', 'Kellen'], ['angelo', 'Angelo']]);
export const PRICES: Record<string, number> = { AAPL: 20_000, MSFT: 40_000, JPM: 25_000, JNJ: 20_000, XOM: 11_000 };

export class FundError extends Error {
  constructor(public status: number, public code: string, message: string, public checks?: Check[]) { super(message); }
}

function fail(status: number, code: string, message: string): never { throw new FundError(status, code, message); }
const dbPath = process.env.FUND_DB_PATH ?? path.join(process.cwd(), 'data', 'virtual-fund.sqlite');
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = DELETE');
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fills (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE, date TEXT NOT NULL, ticker TEXT NOT NULL, quantity INTEGER NOT NULL, price_cents INTEGER NOT NULL, fee_cents INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS runs (date TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS snapshots (date TEXT PRIMARY KEY, payload TEXT NOT NULL);
`);

function person(id: unknown) {
  if (typeof id !== 'string' || !PEOPLE.has(id)) throw new FundError(400, 'INVALID_ACTOR', 'Select a committee member.');
  return { id, name: PEOPLE.get(id)! };
}
function instrument(ticker: unknown): Instrument {
  if (typeof ticker !== 'string') throw new FundError(400, 'INVALID_TICKER', 'Select an instrument.');
  const found = instruments.find((i) => i.ticker === ticker.toUpperCase());
  if (!found) throw new FundError(404, 'UNKNOWN_INSTRUMENT', 'That ticker is not in the fund list.');
  return found;
}
const readOrders = (): Order[] => db.prepare('SELECT payload FROM orders ORDER BY id DESC').all().map((r) => JSON.parse((r as { payload: string }).payload));
const readRuns = (): ValuationRun[] => db.prepare('SELECT payload FROM runs ORDER BY date DESC').all().map((r) => JSON.parse((r as { payload: string }).payload));
const fillRows = () => db.prepare('SELECT * FROM fills ORDER BY id ASC').all() as { id: number; order_id: number; date: string; ticker: string; quantity: number; price_cents: number; fee_cents: number }[];
const usd = (cents: number) => `USD ${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const nyDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function nextTradingDate(date: string): string {
  let d = new Date(`${date}T00:00:00Z`);
  do { d = new Date(d.getTime() + 86_400_000); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}
export const suggestedValuationDate = () => nextTradingDate(nyDate(new Date()));
export const searchInstruments = (q: string) => instruments.filter((i) => `${i.ticker} ${i.name}`.toLowerCase().includes(q.trim().toLowerCase()));
export const listOrders = readOrders;
export const listRuns = readRuns;

function currentAmounts() {
  const fills = fillRows();
  const orders = readOrders();
  const holdings = new Map<string, number>();
  let cash = START_CENTS;
  for (const f of fills) {
    holdings.set(f.ticker, (holdings.get(f.ticker) ?? 0) + f.quantity);
    cash -= f.quantity * f.price_cents + f.fee_cents;
  }
  const holdingsValue = [...holdings].reduce((sum, [ticker, qty]) => sum + qty * PRICES[ticker], 0);
  const nav = cash + holdingsValue;
  const commitments = orders.filter((o) => ['PENDING', 'APPROVED'].includes(o.status) && o.side === 'BUY');
  const committed = commitments.reduce((sum, o) => sum + o.requestedAmountCents, 0);
  return { cash, nav, holdings, commitments, committed };
}

export function previewOrder(body: { ticker?: unknown; side?: unknown; sizePercent?: unknown }): Preview {
  const i = instrument(body.ticker);
  if (body.side !== 'BUY') fail(400, 'UNSUPPORTED_SIDE', 'The demo currently supports buy orders only.');
  const size = body.sizePercent;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || Math.abs(Math.round(size * 100) - size * 100) > 1e-8) throw new FundError(400, 'INVALID_SIZE', 'Size must be greater than zero with at most two decimal places.');
  const { cash, nav, holdings, commitments, committed } = currentAmounts();
  const amount = Math.round(nav * size / 100);
  const tickerValue = (holdings.get(i.ticker) ?? 0) * PRICES[i.ticker];
  const pendingTicker = commitments.filter((o) => o.instrument.ticker === i.ticker).reduce((s, o) => s + o.requestedAmountCents, 0);
  const sectorValue = [...holdings].reduce((s, [ticker, qty]) => s + (instrument(ticker).sector === i.sector ? qty * PRICES[ticker] : 0), 0);
  const pendingSector = commitments.filter((o) => o.instrument.sector === i.sector).reduce((s, o) => s + o.requestedAmountCents, 0);
  const position = (tickerValue + pendingTicker + amount) / nav * 100;
  const sector = (sectorValue + pendingSector + amount) / nav * 100;
  const freeCash = cash - committed;
  const fee = Math.round(amount * FEE_RATE);
  const checks: Check[] = [
    { code: 'POSITION_LIMIT', label: `Position weight ${position.toFixed(1)}% (limit 10%)`, status: position <= 10 + 1e-9 ? 'PASS' : 'FAIL' },
    { code: 'SECTOR_LIMIT', label: `${i.sector} ${sector.toFixed(1)}% (limit 30%)`, status: sector <= 30 + 1e-9 ? 'PASS' : 'FAIL' },
    { code: 'CASH', label: `Cash available for ${usd(amount + fee)}`, status: amount + fee <= freeCash ? 'PASS' : 'FAIL' },
    { code: 'SHARES_HELD', label: 'Shares held to sell', status: 'NA' },
    { code: 'INSTRUMENT_TYPE', label: 'Instrument type allowed (stock)', status: 'PASS' },
  ];
  return { allowed: checks.every((c) => c.status !== 'FAIL'), estimatedAmountCents: amount, checks };
}

export const createOrder = db.transaction((body: NewOrder): Order => {
  const submitter = person(body.actorId);
  if (typeof body.pitch !== 'string' || !body.pitch.trim() || typeof body.rationale !== 'string' || !body.rationale.trim()) fail(400, 'REQUIRED_TEXT', 'Pitch and rationale are required.');
  const preview = previewOrder(body);
  if (!preview.allowed) throw new FundError(422, 'MANDATE_VIOLATION', preview.checks.find((c) => c.status === 'FAIL')?.label ?? 'Order breaks a fund rule.', preview.checks);
  const i = instrument(body.ticker);
  const order: Order = { id: '', createdAt: new Date().toISOString(), instrument: i, side: 'BUY', sizePercent: body.sizePercent, requestedAmountCents: preview.estimatedAmountCents, pitch: body.pitch.trim(), rationale: body.rationale.trim(), submittedBy: submitter, status: 'PENDING', decision: null, fill: null };
  const result = db.prepare('INSERT INTO orders (payload) VALUES (?)').run(JSON.stringify(order));
  order.id = `ord_${String(result.lastInsertRowid).padStart(3, '0')}`;
  db.prepare('UPDATE orders SET payload = ? WHERE id = ?').run(JSON.stringify(order), result.lastInsertRowid);
  return order;
});

export const decideOrder = db.transaction((id: string, body: DecisionRequest): Order => {
  const actor = person(body.actorId);
  const order = readOrders().find((o) => o.id === id);
  if (!order) throw new FundError(404, 'NOT_FOUND', 'Order not found.');
  if (order.status !== 'PENDING') fail(409, 'INVALID_STATUS', 'This order is no longer pending.');
  if (!['APPROVE', 'REJECT', 'CANCEL'].includes(body.action)) fail(400, 'INVALID_ACTION', 'Choose a valid action.');
  const action = body.action as DecisionAction;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (action === 'CANCEL' && actor.id !== order.submittedBy.id) fail(403, 'NOT_SUBMITTER', 'Only the submitter can cancel this order.');
  if (action !== 'CANCEL' && actor.id === order.submittedBy.id) fail(403, 'SELF_APPROVAL', 'You cannot approve your own order.');
  if (action !== 'APPROVE' && !reason) fail(400, 'REASON_REQUIRED', 'Enter a reason.');
  order.status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' }[action] as Order['status'];
  order.decision = { action, by: actor, at: new Date().toISOString(), reason: reason || null };
  db.prepare('UPDATE orders SET payload = ? WHERE id = ?').run(JSON.stringify(order), Number(id.slice(4)));
  return order;
});

function dashboard(asOf?: string): Dashboard {
  const { cash, nav, holdings, committed } = currentAmounts();
  const latest = readRuns()[0];
  const date = asOf ?? latest?.date ?? START_DATE;
  const holdingRows = [...holdings].filter(([, qty]) => qty > 0).map(([ticker, quantity]) => {
    const i = instrument(ticker); const valueCents = quantity * PRICES[ticker];
    return { ticker, name: i.name, quantity, lastPriceCents: PRICES[ticker], valueCents, weightPercent: valueCents / nav * 100, returnPercent: 0 };
  });
  const bySector = new Map<string, number>();
  for (const h of holdingRows) { const sector = instrument(h.ticker).sector; bySector.set(sector, (bySector.get(sector) ?? 0) + h.valueCents); }
  const fundReturn = Math.round((nav / START_CENTS - 1) * 100 * 1_000_000) / 1_000_000;
  const benchmark = latest || asOf ? 0.1 : 0;
  const snapshots = db.prepare('SELECT payload FROM snapshots ORDER BY date ASC').all().map((r) => JSON.parse((r as { payload: string }).payload) as Dashboard);
  const chart = [{ date: START_DATE, fundIndex: 100, benchmarkIndex: 100 }, ...snapshots.map((s) => ({ date: s.asOf, fundIndex: s.fund.navCents / START_CENTS * 100, benchmarkIndex: 100.1 }))];
  const orders = new Map(readOrders().map((o) => [Number(o.id.slice(4)), o]));
  const recentTrades = fillRows().reverse().map((f) => ({ id: `trade_${String(f.id).padStart(3, '0')}`, date: f.date, type: 'FILL', ticker: f.ticker, side: 'BUY' as const, quantity: f.quantity, priceCents: f.price_cents, feeCents: f.fee_cents, orderId: orders.get(f.order_id)!.id, pitch: orders.get(f.order_id)!.pitch }));
  return { asOf: date, fund: { baseCurrency: 'USD', navCents: nav, cashCents: cash, freeCashCents: cash - committed }, performance: { fundSinceStartPercent: fundReturn, benchmarkName: 'S&P 500', benchmarkSinceStartPercent: benchmark, excessSinceStartPercent: Math.round((fundReturn - benchmark) * 1_000_000) / 1_000_000 }, chart, holdings: holdingRows, sectorBreakdown: [...bySector].map(([sector, value]) => ({ sector, weightPercent: value / nav * 100 })).concat([{ sector: 'Cash', weightPercent: cash / nav * 100 }]), recentTrades };
}
export const getDashboard = () => dashboard();

export const runValuation = db.transaction((date: string): ValuationRun => {
  if (!validDate(date) || [0, 6].includes(weekday(date))) fail(400, 'INVALID_DATE', 'Choose a US trading weekday.');
  const saved = db.prepare('SELECT payload FROM runs WHERE date = ?').get(date) as { payload: string } | undefined;
  if (saved) return JSON.parse(saved.payload);
  const last = readRuns()[0];
  if (last && date <= last.date) fail(409, 'INVALID_DATE', 'Choose a date after the last valuation.');
  const ready = readOrders().filter((o) => o.status === 'APPROVED' && date >= nextTradingDate(nyDate(new Date(o.decision!.at))));
  let cash = currentAmounts().cash;
  for (const o of ready) {
    const price = PRICES[o.instrument.ticker];
    const quantity = Math.floor(o.requestedAmountCents / price / o.instrument.lotSize) * o.instrument.lotSize;
    const fee = Math.round(quantity * price * FEE_RATE);
    if (quantity < 1 || cash < quantity * price + fee) fail(422, 'INSUFFICIENT_CASH', 'Cannot fill approved orders with available cash.');
    cash -= quantity * price + fee;
    const orderId = Number(o.id.slice(4));
    db.prepare('INSERT INTO fills (order_id, date, ticker, quantity, price_cents, fee_cents) VALUES (?, ?, ?, ?, ?, ?)').run(orderId, date, o.instrument.ticker, quantity, price, fee);
    o.status = 'FILLED'; o.fill = { date, quantity, priceCents: price, feeCents: fee };
    db.prepare('UPDATE orders SET payload = ? WHERE id = ?').run(JSON.stringify(o), orderId);
  }
  const d = dashboard(date);
  const run: ValuationRun = { date, status: 'SUCCESS', filledOrderIds: ready.map((o) => o.id), navCents: d.fund.navCents, cashCents: d.fund.cashCents };
  db.prepare('INSERT INTO runs (date, payload) VALUES (?, ?)').run(date, JSON.stringify(run));
  db.prepare('INSERT INTO snapshots (date, payload) VALUES (?, ?)').run(date, JSON.stringify(d));
  return run;
});
