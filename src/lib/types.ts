// Shared request and response types. They mirror DEMO_BUILD_SPEC.md.
export type Side = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FILLED';
export type CheckStatus = 'PASS' | 'FAIL' | 'NA';
export type DecisionAction = 'APPROVE' | 'REJECT' | 'CANCEL';

// sellableShares is only set when searching with sellable=true: shares held minus shares already reserved by pending or approved sells.
export interface Instrument { ticker: string; name: string; exchange: string; currency: string; sector: string; type: string; lotSize: number; sellableShares?: number }
export interface Check { code: string; label: string; status: CheckStatus }
// sizePercent is the order size as % of NAV. maxAmountCents is the largest order of this side that would pass every check right now (0 if none).
export interface Preview { allowed: boolean; estimatedAmountCents: number; checks: Check[]; sizePercent?: number; maxAmountCents?: number }
export interface Person { id: string; name: string }
export interface Decision { action: DecisionAction; by: Person; at: string; reason: string | null }
export interface OrderEvent {
  id: string; orderId: string; type: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FILLED';
  at: string; by: Person; details: Record<string, unknown>;
}
// The spec does not define the fill object yet. These optional fields are an assumption.
export interface Fill { date?: string; at?: string; quantity?: number; priceCents?: number; feeCents?: number }
export interface Order {
  id: string; createdAt: string; instrument: Instrument; side: Side; sizePercent: number;
  requestedAmountCents: number; requestedQuantity?: number; pitch: string; rationale: string; submittedBy: Person;
  status: OrderStatus; decision: Decision | null; fill: Fill | null;
}
// Give either sizePercent (% of NAV) or amountUsd (US dollars, up to 2 decimals, e.g. 60000 or 1234.56), not both.
export interface NewOrder { actorId: string; ticker: string; side: Side; sizePercent?: number; amountUsd?: number; pitch: string; rationale: string }
export interface DecisionRequest { actorId: string; action: DecisionAction; reason?: string }
export interface ValuationRun { date: string; status: string; filledOrderIds: string[]; navCents: number; cashCents: number; at?: string }
export interface Dashboard {
  asOf: string;
  fund: { baseCurrency: string; navCents: number; cashCents: number; freeCashCents: number };
  performance: { fundSinceStartPercent: number; benchmarkName: string; benchmarkSinceStartPercent: number; excessSinceStartPercent: number };
  chart: { date: string; fundIndex: number; benchmarkIndex: number }[];
  holdings: { ticker: string; name: string; quantity: number; lastPriceCents: number; valueCents: number; weightPercent: number; returnPercent: number }[];
  sectorBreakdown: { sector: string; weightPercent: number }[];
  recentTrades: { id: string; date: string; type: string; ticker: string; side: Side; quantity: number; priceCents: number; feeCents: number; orderId: string; pitch: string; executedAt?: string | null }[];
}
