// Temporary data in the shape of the API responses. Used while NEXT_PUBLIC_USE_MOCK is not "false".
import type { Dashboard, Instrument, Order } from './types';

export const instruments: Instrument[] = [
  ['AAPL', 'Apple Inc.', 'NASDAQ', 'Technology'],
  ['MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology'],
  ['JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Financials'],
  ['JNJ', 'Johnson & Johnson', 'NYSE', 'Health Care'],
  ['XOM', 'Exxon Mobil Corporation', 'NYSE', 'Energy'],
].map(([ticker, name, exchange, sector]) => ({ ticker, name, exchange, currency: 'USD', sector, type: 'STOCK', lotSize: 1 }));

const person = (id: string) => ({ id, name: id[0].toUpperCase() + id.slice(1) });
const inst = (t: string) => instruments.find((i) => i.ticker === t)!;

export const orders: Order[] = [
  { id: 'ord_004', createdAt: '2026-11-04T19:20:00Z', instrument: inst('XOM'), side: 'BUY', sizePercent: 5, requestedAmountCents: 5000000, pitch: 'Exxon energy cash flow', rationale: 'High free cash flow and a well-covered dividend.', submittedBy: person('angelo'), status: 'PENDING', decision: null, fill: null },
  { id: 'ord_003', createdAt: '2026-11-04T19:00:00Z', instrument: inst('JNJ'), side: 'BUY', sizePercent: 6, requestedAmountCents: 6000000, pitch: 'J&J pharma pipeline', rationale: 'Defensive earnings and a steady dividend.', submittedBy: person('kellen'), status: 'PENDING', decision: null, fill: null },
  // To test sell orders
  { id: 'ord_002', createdAt: '2026-11-03T15:00:00Z', instrument: inst('JPM'), side: 'BUY', sizePercent: 5, requestedAmountCents: 5000000, pitch: 'JPMorgan rate outlook', rationale: 'Higher rates support lending margins.', submittedBy: person('angelo'), status: 'FILLED', decision: { action: 'APPROVE', by: person('kellen'), at: '2026-11-03T16:00:00Z', reason: null }, fill: { date: '2026-11-05', at: '2026-11-05T21:05:00Z' } },
  { id: 'ord_001', createdAt: '2026-11-03T14:00:00Z', instrument: inst('AAPL'), side: 'BUY', sizePercent: 8, requestedAmountCents: 8000000, pitch: 'Apple services pitch', rationale: 'Growing services revenue and strong cash flow.', submittedBy: person('kellen'), status: 'FILLED', decision: { action: 'APPROVE', by: person('angelo'), at: '2026-11-03T15:00:00Z', reason: null }, fill: { date: '2026-11-05', at: '2026-11-05T21:00:00Z' } },
];

export const dashboardStart: Dashboard = {
  asOf: '2026-11-04',
  fund: { baseCurrency: 'USD', navCents: 100000000, cashCents: 100000000, freeCashCents: 89000000 },
  performance: { fundSinceStartPercent: 0, benchmarkName: 'S&P 500', benchmarkSinceStartPercent: 0, excessSinceStartPercent: 0 },
  chart: [{ date: '2026-11-04', fundIndex: 100, benchmarkIndex: 100 }],
  holdings: [], sectorBreakdown: [{ sector: 'Cash', weightPercent: 100 }], recentTrades: [],
};

export const dashboardAfterFill: Dashboard = {
  asOf: '2026-11-05',
  fund: { baseCurrency: 'USD', navCents: 99994000, cashCents: 93994000, freeCashCents: 93994000 },
  performance: { fundSinceStartPercent: -0.006, benchmarkName: 'S&P 500', benchmarkSinceStartPercent: 0.1, excessSinceStartPercent: -0.106 },
  chart: [{ date: '2026-11-04', fundIndex: 100, benchmarkIndex: 100 }, { date: '2026-11-05', fundIndex: 99.994, benchmarkIndex: 100.1 }],
  holdings: [{ ticker: 'JNJ', name: 'Johnson & Johnson', quantity: 300, lastPriceCents: 20000, valueCents: 6000000, weightPercent: 6.0, returnPercent: 0 }],
  sectorBreakdown: [{ sector: 'Health Care', weightPercent: 6.0 }, { sector: 'Cash', weightPercent: 94.0 }],
  recentTrades: [{ id: 'trade_001', date: '2026-11-05', type: 'FILL', ticker: 'JNJ', side: 'BUY', quantity: 300, priceCents: 20000, feeCents: 6000, orderId: 'ord_001', pitch: 'J&J pharma pipeline' }],
};
