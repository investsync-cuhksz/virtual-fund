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
