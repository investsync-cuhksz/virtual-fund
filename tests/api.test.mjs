import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function start(dbPath) {
  const port = await freePort();
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(), env: { ...process.env, FUND_DB_PATH: dbPath }, stdio: 'ignore', windowsHide: true,
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Next server exited with ${child.exitCode}`);
    try { if ((await fetch(`${base}/api/instruments`)).ok) return { child, base }; } catch { /* still starting */ }
    await delay(100);
  }
  child.kill();
  throw new Error('Next server did not start');
}

async function request(base, route, body) {
  const response = await fetch(`${base}${route}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

function nextWeekday() {
  const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let date = new Date(`${ny}T00:00:00Z`);
  do { date = new Date(date.getTime() + 86_400_000); } while ([0, 6].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
}

async function withFreshServer(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'investsync-api-'));
  let server;
  try {
    server = await start(path.join(directory, 'fund.sqlite'));
    await run(server.base);
  } finally {
    server?.child.kill();
    if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('investsync-api-')) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try { await rm(directory, { recursive: true, force: true }); break; }
        catch (error) { if (attempt === 9) throw error; await delay(200); }
      }
    }
  }
}

const order = (ticker, sizePercent, actorId = 'kellen') => ({ actorId, ticker, side: 'BUY', sizePercent, pitch: `${ticker} pitch`, rationale: 'Demo research rationale.' });

test('invalid submissions fail without creating orders', async () => withFreshServer(async (base) => {
  const cases = [
    [order('FAKE', 5), 404, 'UNKNOWN_INSTRUMENT'],
    [{ ...order('JNJ', 5), actorId: 'unknown' }, 400, 'INVALID_ACTOR'],
    [{ ...order('JNJ', 5), side: 'SELL' }, 400, 'UNSUPPORTED_SIDE'],
    [order('JNJ', 0), 400, 'INVALID_SIZE'],
    [order('JNJ', 0.001), 400, 'INVALID_SIZE'],
    [{ ...order('JNJ', 5), pitch: 12 }, 400, 'REQUIRED_TEXT'],
  ];
  for (const [body, status, code] of cases) {
    const response = await request(base, '/api/orders', body);
    assert.equal(response.status, status);
    assert.equal(response.data.error.code, code);
  }
  const malformed = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  assert.equal((await request(base, '/api/orders')).data.orders.length, 0);
}));

test('commitments, approvals, rejection, and cancellation obey the rules', async () => withFreshServer(async (base) => {
  const first = await request(base, '/api/orders', order('JNJ', 6));
  const id = first.data.order.id;
  const duplicatePreview = await request(base, '/api/orders/preview', { ticker: 'JNJ', side: 'BUY', sizePercent: 5 });
  assert.equal(duplicatePreview.data.allowed, false);
  assert.equal(duplicatePreview.data.checks.find((c) => c.code === 'POSITION_LIMIT').status, 'FAIL');
  const cashPreview = await request(base, '/api/orders/preview', { ticker: 'AAPL', side: 'BUY', sizePercent: 101 });
  assert.equal(cashPreview.data.checks.find((c) => c.code === 'CASH').status, 'FAIL');
  const sectorPreview = await request(base, '/api/orders/preview', { ticker: 'JNJ', side: 'BUY', sizePercent: 35 });
  assert.equal(sectorPreview.data.checks.find((c) => c.code === 'SECTOR_LIMIT').status, 'FAIL');
  assert.equal((await request(base, '/api/dashboard')).data.fund.freeCashCents, 94_000_000);
  assert.equal((await request(base, `/api/orders/${id}/decision`, { actorId: 'angelo', action: 'REJECT' })).data.error.code, 'REASON_REQUIRED');
  assert.equal((await request(base, `/api/orders/${id}/decision`, { actorId: 'kellen', action: 'REJECT', reason: 'No' })).status, 403);
  const rejected = await request(base, `/api/orders/${id}/decision`, { actorId: 'angelo', action: 'REJECT', reason: 'Too expensive' });
  assert.equal(rejected.data.order.status, 'REJECTED');
  assert.equal(rejected.data.order.decision.reason, 'Too expensive');
  assert.equal((await request(base, `/api/orders/${id}/decision`, { actorId: 'angelo', action: 'APPROVE' })).status, 409);
  assert.equal((await request(base, '/api/dashboard')).data.fund.freeCashCents, 100_000_000);
  const second = await request(base, '/api/orders', order('XOM', 5));
  const secondId = second.data.order.id;
  assert.equal((await request(base, `/api/orders/${secondId}/decision`, { actorId: 'angelo', action: 'CANCEL', reason: 'Changed mind' })).status, 403);
  assert.equal((await request(base, `/api/orders/${secondId}/decision`, { actorId: 'kellen', action: 'CANCEL', reason: 42 })).status, 400);
  const cancelled = await request(base, `/api/orders/${secondId}/decision`, { actorId: 'kellen', action: 'CANCEL', reason: 'Pitch withdrawn' });
  assert.equal(cancelled.data.order.status, 'CANCELLED');
  assert.equal((await request(base, '/api/dashboard')).data.fund.freeCashCents, 100_000_000);
  const run = await request(base, '/api/valuation', { date: nextWeekday() });
  assert.deepEqual(run.data.run.filledOrderIds, []);
  assert.deepEqual((await request(base, '/api/dashboard')).data.recentTrades, []);
}));

test('simultaneous orders cannot jointly exceed a position limit', async () => withFreshServer(async (base) => {
  const [a, b] = await Promise.all([
    request(base, '/api/orders', order('JNJ', 6)),
    request(base, '/api/orders', order('JNJ', 6, 'angelo')),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 422]);
  const saved = (await request(base, '/api/orders')).data.orders;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].requestedAmountCents, 6_000_000);
}));

test('two approved orders fill once on a later weekday with whole shares and fees', async () => withFreshServer(async (base) => {
  const jnj = (await request(base, '/api/orders', order('JNJ', 6))).data.order.id;
  const xom = (await request(base, '/api/orders', order('XOM', 5, 'angelo'))).data.order.id;
  assert.equal((await request(base, `/api/orders/${jnj}/decision`, { actorId: 'angelo', action: 'APPROVE', reason: 7 })).status, 200);
  assert.equal((await request(base, `/api/orders/${xom}/decision`, { actorId: 'kellen', action: 'APPROVE' })).status, 200);
  const saturday = '2026-11-07';
  assert.equal((await request(base, '/api/valuation', { date: saturday })).status, 400);
  assert.equal((await request(base, '/api/valuation', { date: '2026-02-30' })).status, 400);
  const tooEarly = await request(base, '/api/valuation', { date: '2026-11-04' });
  assert.deepEqual(tooEarly.data.run.filledOrderIds, []);
  const date = nextWeekday();
  const run = await request(base, '/api/valuation', { date });
  assert.deepEqual(run.data.run.filledOrderIds, [xom, jnj]);
  assert.equal(run.data.run.cashCents, 88_995_006);
  assert.equal(run.data.run.navCents, 99_989_006);
  const dashboard = (await request(base, '/api/dashboard')).data;
  assert.equal(dashboard.recentTrades.length, 2);
  assert.equal(dashboard.recentTrades.find((t) => t.ticker === 'XOM').quantity, 454);
  assert.equal(dashboard.recentTrades.find((t) => t.ticker === 'XOM').feeCents, 4_994);
  assert.equal(dashboard.sectorBreakdown.reduce((sum, s) => sum + s.weightPercent, 0).toFixed(6), '100.000000');
  assert.equal((await request(base, '/api/valuation', { date: '2026-11-05' })).status, 409);
  assert.deepEqual((await request(base, '/api/valuation', { date })).data.run, run.data.run);
  assert.equal((await request(base, '/api/valuation')).data.runs.length, 2);
}));

test('order approval, fill, saved dashboard, and idempotent valuation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'investsync-api-'));
  const dbPath = path.join(directory, 'fund.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const { base } = server;
    const before = await request(base, '/api/dashboard');
    assert.equal(before.data.fund.navCents, 100_000_000);
    assert.deepEqual(before.data.holdings, []);
    const search = await request(base, '/api/instruments?q=jnj');
    assert.equal(search.data.instruments[0].ticker, 'JNJ');
    const preview = await request(base, '/api/orders/preview', { ticker: 'JNJ', side: 'BUY', sizePercent: 6 });
    assert.equal(preview.data.allowed, true);
    assert.equal(preview.data.estimatedAmountCents, 6_000_000);
    const invalid = await request(base, '/api/orders', { actorId: 'kellen', ticker: 'JNJ', side: 'BUY', sizePercent: 15, pitch: 'x', rationale: 'x' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.data.error.code, 'MANDATE_VIOLATION');
    assert.equal((await request(base, '/api/orders')).data.orders.length, 0);
    const created = await request(base, '/api/orders', { actorId: 'kellen', ticker: 'JNJ', side: 'BUY', sizePercent: 6, pitch: 'J&J pitch', rationale: 'Defensive earnings.' });
    assert.equal(created.status, 201);
    const id = created.data.order.id;
    assert.equal((await request(base, '/api/dashboard')).data.fund.freeCashCents, 94_000_000);
    const self = await request(base, `/api/orders/${id}/decision`, { actorId: 'kellen', action: 'APPROVE' });
    assert.equal(self.status, 403);
    const approved = await request(base, `/api/orders/${id}/decision`, { actorId: 'angelo', action: 'APPROVE' });
    assert.equal(approved.data.order.status, 'APPROVED');
    const date = nextWeekday();
    const run = await request(base, '/api/valuation', { date });
    assert.equal(run.data.run.navCents, 99_994_000);
    assert.equal(run.data.run.cashCents, 93_994_000);
    assert.deepEqual(run.data.run.filledOrderIds, [id]);
    const again = await request(base, '/api/valuation', { date });
    assert.deepEqual(again.data.run, run.data.run);
    assert.equal((await request(base, '/api/valuation')).data.runs.length, 1);
    const dashboard = await request(base, '/api/dashboard');
    assert.equal(dashboard.data.fund.navCents, 99_994_000);
    assert.equal(dashboard.data.holdings[0].quantity, 300);
    assert.equal(dashboard.data.recentTrades[0].feeCents, 6_000);
    assert.equal(dashboard.data.performance.fundSinceStartPercent, -0.006);
    server.child.kill();
    server = undefined;
    const restarted = await start(dbPath);
    server = restarted;
    assert.equal((await request(restarted.base, '/api/orders')).data.orders[0].status, 'FILLED');
    assert.equal((await request(restarted.base, '/api/dashboard')).data.fund.navCents, 99_994_000);
  } finally {
    server?.child.kill();
    if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('investsync-api-')) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try { await rm(directory, { recursive: true, force: true }); break; }
        catch (error) { if (attempt === 9) throw error; await delay(200); }
      }
    }
  }
});
