import 'server-only';

import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { instruments } from './mock-data';
import { marketClose, nextMarketDate } from './market-data';
import type { Check, Dashboard, DecisionAction, DecisionRequest, Instrument, NewOrder, Order, OrderEvent, Person, Preview, ValuationRun } from './types';

const START_CENTS = 100_000_000;
const START_DATE = '2026-11-04';
const FEE_RATE = 0.001;
const PEOPLE = new Map([['kellen', 'Kellen'], ['angelo', 'Angelo']]);

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
  CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, type TEXT NOT NULL, at TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, details TEXT NOT NULL);
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
const addOrderEvent = (orderId: number, type: OrderEvent['type'], at: string, by: Person, details: Record<string, unknown>) =>
  db.prepare('INSERT INTO order_events (order_id, type, at, actor_id, actor_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, type, at, by.id, by.name, JSON.stringify(details));
const submittedDetails = (order: Order) => ({ ticker: order.instrument.ticker, side: order.side, sizePercent: order.sizePercent, requestedAmountCents: order.requestedAmountCents, ...(order.requestedQuantity === undefined ? {} : { requestedQuantity: order.requestedQuantity }), pitch: order.pitch, rationale: order.rationale });
const decisionType = (action: DecisionAction): OrderEvent['type'] => ({ APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' })[action] as OrderEvent['type'];
const SYSTEM: Person = { id: 'system', name: 'System' };

// Existing local databases predate the event log. Reconstruct their known events once.
db.transaction(() => {
  for (const order of readOrders().reverse()) {
    const orderId = Number(order.id.slice(4));
    const count = db.prepare('SELECT COUNT(*) AS total FROM order_events WHERE order_id = ?').get(orderId) as { total: number };
    if (count.total) continue;
    addOrderEvent(orderId, 'SUBMITTED', order.createdAt, order.submittedBy, { ...submittedDetails(order), backfilled: true });
    if (order.decision) addOrderEvent(orderId, decisionType(order.decision.action), order.decision.at, order.decision.by, { reason: order.decision.reason, backfilled: true });
    if (order.fill) addOrderEvent(orderId, 'FILLED', order.fill.at ?? `${order.fill.date}T21:00:00.000Z`, SYSTEM, { ...order.fill, backfilled: true });
  }
})();

export function listOrderEvents(id: string): OrderEvent[] {
  if (!readOrders().some((order) => order.id === id)) fail(404, 'NOT_FOUND', 'Order not found.');
  const rows = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC').all(Number(id.slice(4))) as { id: number; order_id: number; type: OrderEvent['type']; at: string; actor_id: string; actor_name: string; details: string }[];
  return rows.map((row) => ({ id: `event_${String(row.id).padStart(3, '0')}`, orderId: id, type: row.type, at: row.at, by: { id: row.actor_id, name: row.actor_name }, details: JSON.parse(row.details) }));
}
const usd = (cents: number) => `USD ${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const now = () => new Date(process.env.FUND_DEMO_NOW ?? Date.now());
const nyDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
export const listOrders = readOrders;
export const listRuns = readRuns;

function currentAmounts(asOf = readRuns()[0]?.date ?? START_DATE) {
  const close = marketClose(asOf);
  if (!close) fail(422, 'PRICE_UNAVAILABLE', `No demo closing prices for ${asOf}.`);
  const fills = fillRows();
  const orders = readOrders();
  const holdings = new Map<string, number>();
  let cash = START_CENTS;
  for (const f of fills) {
    holdings.set(f.ticker, (holdings.get(f.ticker) ?? 0) + f.quantity);
    cash -= f.quantity * f.price_cents + f.fee_cents;
  }
  const holdingsValue = [...holdings].reduce((sum, [ticker, qty]) => sum + qty * close.prices[ticker as keyof typeof close.prices], 0);
  const nav = cash + holdingsValue;
  const commitments = orders.filter((o) => ['PENDING', 'APPROVED'].includes(o.status) && o.side === 'BUY');
  const committed = commitments.reduce((sum, o) => sum + o.requestedAmountCents, 0);
  return { cash, nav, holdings, commitments, committed, close };
}

const lotQuantity = (amount: number, price: number, lotSize: number) => Math.floor(amount / price / lotSize) * lotSize;
function sellAvailability(ticker: string, held: number, excludingId?: string) {
  const reserved = readOrders()
    .filter((o) => o.id !== excludingId && o.side === 'SELL' && ['PENDING', 'APPROVED'].includes(o.status) && o.instrument.ticker === ticker)
    .reduce((sum, o) => sum + (o.requestedQuantity ?? 0), 0);
  return held - reserved;
}

// With sellableOnly, only instruments the fund can actually sell are returned, each with the shares still free to sell.
export function searchInstruments(q: string, sellableOnly = false): Instrument[] {
  const found = instruments.filter((i) => `${i.ticker} ${i.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  if (!sellableOnly) return found;
  const { holdings } = currentAmounts();
  return found.flatMap((i) => {
    const available = sellAvailability(i.ticker, holdings.get(i.ticker) ?? 0);
    return available >= i.lotSize ? [{ ...i, sellableShares: available }] : [];
  });
}

// The order size is either sizePercent (% of NAV) or amountUsd (US dollars, up to 2 decimals)S
export function previewOrder(body: { ticker?: unknown; side?: unknown; sizePercent?: unknown; amountUsd?: unknown }): Preview {
  const i = instrument(body.ticker);
  if (body.side !== 'BUY' && body.side !== 'SELL') fail(400, 'UNSUPPORTED_SIDE', 'Choose buy or sell.');
  const byAmount = body.amountUsd !== undefined;
  if (byAmount && body.sizePercent !== undefined) fail(400, 'INVALID_SIZE', 'Give a percent of NAV or a dollar amount, not both.');
  const size = body.sizePercent;
  if (byAmount) {
    const usdAmount = body.amountUsd;
    if (typeof usdAmount !== 'number' || !Number.isFinite(usdAmount) || usdAmount <= 0 || Math.abs(Math.round(usdAmount * 100) - usdAmount * 100) > 1e-8) fail(400, 'INVALID_SIZE', 'Amount must be greater than zero dollars, with at most two decimal places.');
  } else if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || Math.abs(Math.round(size * 100) - size * 100) > 1e-8) throw new FundError(400, 'INVALID_SIZE', 'Size must be greater than zero with at most two decimal places.');
  const { cash, nav, holdings, commitments, committed, close } = currentAmounts();
  const amount = byAmount ? Math.round((body.amountUsd as number) * 100) : Math.round(nav * (size as number) / 100);
  const sizePercent = byAmount ? Math.round(amount / nav * 10_000) / 100 : size as number;
  const price = close.prices[i.ticker as keyof typeof close.prices];
  if (body.side === 'SELL') {
    const held = holdings.get(i.ticker) ?? 0;
    const available = sellAvailability(i.ticker, held);
    const quantity = lotQuantity(amount, price, i.lotSize);
    const checks: Check[] = [
      { code: 'POSITION_LIMIT', label: 'Position weight (a sale lowers it)', status: 'NA' },
      { code: 'SECTOR_LIMIT', label: `${i.sector} sector (a sale lowers it)`, status: 'NA' },
      { code: 'CASH', label: 'Cash (a sale adds cash)', status: 'NA' },
      { code: 'SHARES_HELD', label: `Shares to sell: ${quantity} (${available} available of ${held} held)`, status: quantity > 0 && quantity <= available ? 'PASS' : 'FAIL' },
      { code: 'INSTRUMENT_TYPE', label: 'Instrument type allowed (stock)', status: 'PASS' },
    ];
    // Max sell is every unreserved share at the latest close.
    return { allowed: checks.every((c) => c.status !== 'FAIL'), estimatedAmountCents: amount, checks, sizePercent, maxAmountCents: Math.max(available, 0) * price };
  }
  const tickerValue = (holdings.get(i.ticker) ?? 0) * price;
  const pendingTicker = commitments.filter((o) => o.instrument.ticker === i.ticker).reduce((s, o) => s + o.requestedAmountCents, 0);
  const sectorValue = [...holdings].reduce((s, [ticker, qty]) => s + (instrument(ticker).sector === i.sector ? qty * close.prices[ticker as keyof typeof close.prices] : 0), 0);
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
  // Max buy is the largest amount that still passes the position, sector and cash checks (integer cents).
  const positionRoom = Math.floor((nav * 10 - 100 * (tickerValue + pendingTicker)) / 100);
  const sectorRoom = Math.floor((nav * 30 - 100 * (sectorValue + pendingSector)) / 100);
  let cashRoom = Math.floor(freeCash / (1 + FEE_RATE));
  while (cashRoom > 0 && cashRoom + Math.round(cashRoom * FEE_RATE) > freeCash) cashRoom--;
  return { allowed: checks.every((c) => c.status !== 'FAIL'), estimatedAmountCents: amount, checks, sizePercent, maxAmountCents: Math.max(0, Math.min(positionRoom, sectorRoom, cashRoom)) };
}

export const createOrder = db.transaction((body: NewOrder): Order => {
  const submitter = person(body.actorId);
  if (typeof body.pitch !== 'string' || !body.pitch.trim() || typeof body.rationale !== 'string' || !body.rationale.trim()) fail(400, 'REQUIRED_TEXT', 'Pitch and rationale are required.');
  const preview = previewOrder(body);
  if (!preview.allowed) throw new FundError(422, 'MANDATE_VIOLATION', preview.checks.find((c) => c.status === 'FAIL')?.label ?? 'Order breaks a fund rule.', preview.checks);
  const i = instrument(body.ticker);
  const close = currentAmounts().close;
  const requestedQuantity = body.side === 'SELL'
    ? lotQuantity(preview.estimatedAmountCents, close.prices[i.ticker as keyof typeof close.prices], i.lotSize)
    : undefined;
  // sizePercent comes from the preview so dollar-amount orders store the equivalent % of NAV.
  const order: Order = { id: '', createdAt: now().toISOString(), instrument: i, side: body.side, sizePercent: preview.sizePercent!, requestedAmountCents: preview.estimatedAmountCents, ...(requestedQuantity === undefined ? {} : { requestedQuantity }), pitch: body.pitch.trim(), rationale: body.rationale.trim(), submittedBy: submitter, status: 'PENDING', decision: null, fill: null };
  const result = db.prepare('INSERT INTO orders (payload) VALUES (?)').run(JSON.stringify(order));
  order.id = `ord_${String(result.lastInsertRowid).padStart(3, '0')}`;
  db.prepare('UPDATE orders SET payload = ? WHERE id = ?').run(JSON.stringify(order), result.lastInsertRowid);
  addOrderEvent(Number(result.lastInsertRowid), 'SUBMITTED', order.createdAt, submitter, submittedDetails(order));
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
  if (action === 'APPROVE' && order.side === 'SELL') {
    const held = currentAmounts().holdings.get(order.instrument.ticker) ?? 0;
    if (!order.requestedQuantity || order.requestedQuantity > sellAvailability(order.instrument.ticker, held, order.id))
      fail(409, 'INSUFFICIENT_SHARES', 'The fund no longer has enough unreserved shares to approve this sale.');
  }
  order.status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' }[action] as Order['status'];
  order.decision = { action, by: actor, at: now().toISOString(), reason: reason || null };
  db.prepare('UPDATE orders SET payload = ? WHERE id = ?').run(JSON.stringify(order), Number(id.slice(4)));
  addOrderEvent(Number(id.slice(4)), decisionType(action), order.decision.at, actor, { reason: order.decision.reason });
  return order;
});

function dashboard(asOf?: string): Dashboard {
  const { cash, nav, holdings, committed, close } = currentAmounts(asOf);
  const fills = fillRows();
  const latest = readRuns()[0];
  const date = asOf ?? latest?.date ?? START_DATE;
  const holdingRows = [...holdings].filter(([, qty]) => qty > 0).map(([ticker, quantity]) => {
    const i = instrument(ticker); const lastPriceCents = close.prices[ticker as keyof typeof close.prices];
    const valueCents = quantity * lastPriceCents;
    let cost = 0;
    let shares = 0;
    for (const f of fills.filter((row) => row.ticker === ticker)) {
      if (f.quantity > 0) { shares += f.quantity; cost += f.quantity * f.price_cents + f.fee_cents; }
      else { cost = shares + f.quantity > 0 ? cost * (shares + f.quantity) / shares : 0; shares += f.quantity; }
    }
    return { ticker, name: i.name, quantity, lastPriceCents, valueCents, weightPercent: valueCents / nav * 100, returnPercent: cost ? Math.round((valueCents / cost - 1) * 100 * 1_000_000) / 1_000_000 : 0 };
  });
  const bySector = new Map<string, number>();
  for (const h of holdingRows) { const sector = instrument(h.ticker).sector; bySector.set(sector, (bySector.get(sector) ?? 0) + h.valueCents); }
  const fundReturn = Math.round((nav / START_CENTS - 1) * 100 * 1_000_000) / 1_000_000;
  const benchmark = Math.round((close.benchmarkIndex / marketClose(START_DATE)!.benchmarkIndex - 1) * 100 * 1_000_000) / 1_000_000;
  const snapshots = db.prepare('SELECT payload FROM snapshots ORDER BY date ASC').all().map((r) => JSON.parse((r as { payload: string }).payload) as Dashboard);
  const chart = [{ date: START_DATE, fundIndex: 100, benchmarkIndex: 100 }, ...snapshots.filter((s) => s.asOf !== START_DATE).map((s) => ({ date: s.asOf, fundIndex: s.fund.navCents / START_CENTS * 100, benchmarkIndex: marketClose(s.asOf)!.benchmarkIndex }))];
  if (asOf && asOf !== START_DATE && !snapshots.some((s) => s.asOf === asOf)) chart.push({ date: asOf, fundIndex: nav / START_CENTS * 100, benchmarkIndex: close.benchmarkIndex });
  const orders = new Map(readOrders().map((o) => [Number(o.id.slice(4)), o]));
  const recentTrades = fills.reverse().map((f) => {
    const order = orders.get(f.order_id)!;
    return { id: `trade_${String(f.id).padStart(3, '0')}`, date: f.date, type: 'FILL', ticker: f.ticker, side: order.side, quantity: Math.abs(f.quantity), priceCents: f.price_cents, feeCents: f.fee_cents, orderId: order.id, pitch: order.pitch, executedAt: order.fill?.at ?? null };
  });
  return { asOf: date, fund: { baseCurrency: 'USD', navCents: nav, cashCents: cash, freeCashCents: cash - committed }, performance: { fundSinceStartPercent: fundReturn, benchmarkName: 'S&P 500', benchmarkSinceStartPercent: benchmark, excessSinceStartPercent: Math.round((fundReturn - benchmark) * 1_000_000) / 1_000_000 }, chart, holdings: holdingRows, sectorBreakdown: [...bySector].map(([sector, value]) => ({ sector, weightPercent: value / nav * 100 })).concat([{ sector: 'Cash', weightPercent: cash / nav * 100 }]), recentTrades };
}
export const getDashboard = () => dashboard();

export const runValuation = db.transaction((date: string): ValuationRun => {
  if (!validDate(date)) fail(400, 'INVALID_DATE', 'Choose a valid valuation date.');
  const close = marketClose(date);
  if (!close) fail(422, 'PRICE_UNAVAILABLE', `No demo closing prices for ${date}.`);
  const saved = db.prepare('SELECT payload FROM runs WHERE date = ?').get(date) as { payload: string } | undefined;
  if (saved) return JSON.parse(saved.payload);
  const last = readRuns()[0];
  if (last && date <= last.date) fail(409, 'INVALID_DATE', 'Choose a date after the last valuation.');
  const ready = readOrders().filter((o) => o.status === 'APPROVED' && date >= (nextMarketDate(nyDate(new Date(o.decision!.at))) ?? '9999-12-31'));
  let cash = currentAmounts().cash;
  const available = new Map(currentAmounts().holdings);
  const at = `${date}T21:00:00.000Z`;
  for (const o of ready) {
    const price = close.prices[o.instrument.ticker as keyof typeof close.prices];
    const quantity = o.side === 'SELL' ? o.requestedQuantity ?? 0 : lotQuantity(o.requestedAmountCents, price, o.instrument.lotSize);
    const fee = Math.round(quantity * price * FEE_RATE);
    if (quantity < 1) fail(422, 'INVALID_QUANTITY', 'Order has no whole shares to fill.');
    if (o.side === 'SELL') {
      if (quantity > (available.get(o.instrument.ticker) ?? 0)) fail(422, 'INSUFFICIENT_SHARES', 'Cannot sell more shares than the fund holds.');
      available.set(o.instrument.ticker, (available.get(o.instrument.ticker) ?? 0) - quantity);
      cash += quantity * price - fee;
    } else {
      if (cash < quantity * price + fee) fail(422, 'INSUFFICIENT_CASH', 'Cannot fill approved orders with available cash.');
      available.set(o.instrument.ticker, (available.get(o.instrument.ticker) ?? 0) + quantity);
      cash -= quantity * price + fee;
    }
    const orderId = Number(o.id.slice(4));
    db.prepare('INSERT INTO fills (order_id, date, ticker, quantity, price_cents, fee_cents) VALUES (?, ?, ?, ?, ?, ?)').run(orderId, date, o.instrument.ticker, o.side === 'SELL' ? -quantity : quantity, price, fee);
    o.status = 'FILLED'; o.fill = { date, at, quantity, priceCents: price, feeCents: fee };
    db.prepare('UPDATE orders SET payload = ? WHERE id = ?').run(JSON.stringify(o), orderId);
    addOrderEvent(orderId, 'FILLED', at, SYSTEM, { ...o.fill });
  }
  const d = dashboard(date);
  const run: ValuationRun = { date, at, status: 'SUCCESS', filledOrderIds: ready.map((o) => o.id), navCents: d.fund.navCents, cashCents: d.fund.cashCents };
  db.prepare('INSERT INTO runs (date, payload) VALUES (?, ?)').run(date, JSON.stringify(run));
  db.prepare('INSERT INTO snapshots (date, payload) VALUES (?, ?)').run(date, JSON.stringify(d));
  return run;
});
