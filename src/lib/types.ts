// Shared request and response types. They mirror DEMO_BUILD_SPEC.md.
export type Side = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FILLED';
export type CheckStatus = 'PASS' | 'FAIL' | 'NA';
export type DecisionAction = 'APPROVE' | 'REJECT' | 'CANCEL';

export interface Instrument { ticker: string; name: string; exchange: string; currency: string; sector: string; type: string; lotSize: number }
export interface Check { code: string; label: string; status: CheckStatus }
export interface Preview { allowed: boolean; estimatedAmountCents: number; checks: Check[] }
export interface Person { id: string; name: string }
export interface Decision { action: DecisionAction; by: Person; at: string; reason: string | null }
// The spec does not define the fill object yet. These optional fields are an assumption.
export interface Fill { date?: string; quantity?: number; priceCents?: number; feeCents?: number }
export interface Order {
  id: string; createdAt: string; instrument: Instrument; side: Side; sizePercent: number;
  requestedAmountCents: number; pitch: string; rationale: string; submittedBy: Person;
  status: OrderStatus; decision: Decision | null; fill: Fill | null;
}
export interface NewOrder { actorId: string; ticker: string; side: Side; sizePercent: number; pitch: string; rationale: string }
export interface DecisionRequest { actorId: string; action: DecisionAction; reason?: string }
export interface ValuationRun { date: string; status: string; filledOrderIds: string[]; navCents: number; cashCents: number }
export interface Dashboard {
  asOf: string;
  fund: { baseCurrency: string; navCents: number; cashCents: number; freeCashCents: number };
  performance: { fundSinceStartPercent: number; benchmarkName: string; benchmarkSinceStartPercent: number; excessSinceStartPercent: number };
  chart: { date: string; fundIndex: number; benchmarkIndex: number }[];
  holdings: { ticker: string; name: string; quantity: number; lastPriceCents: number; valueCents: number; weightPercent: number; returnPercent: number }[];
  sectorBreakdown: { sector: string; weightPercent: number }[];
  recentTrades: { id: string; date: string; type: string; ticker: string; side: Side; quantity: number; priceCents: number; feeCents: number; orderId: string; pitch: string }[];
}
