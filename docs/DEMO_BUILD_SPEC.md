# Virtual Fund demo build spec

This is the shared contract for Kellen's three screens and Angelo's backend. It covers the local demo planned for 21 November 2026. The frontend and API live in the same Next.js app; screen code calls these routes with `fetch('/api/...')`.

## Frontend handoff and exact stack

Use **one repository and one Next.js App Router project**. Both sides use React and TypeScript. Kellen styles the screens with **Tailwind CSS**. Angelo implements the backend with **Next.js Route Handlers** and **SQLite** (`better-sqlite3`). A separate Python script uses AKShare to cache market prices; Python is not the web server. The repository's `package.json` and lockfile will pin the exact package versions when Angelo creates the scaffold.

Angelo creates and shares the scaffold first. Kellen should build inside that project rather than generate a second Next.js app. The file split is:

```text
src/app/enter-order/page.tsx          Kellen: order form and checks
src/app/orders/page.tsx               Kellen: order list and approval UI
src/app/dashboard/page.tsx            Kellen: fund dashboard
src/components/                     Kellen: shared visual components
src/lib/mock-data.ts                  Kellen: temporary data matching the JSON below
src/app/api/**/route.ts               Angelo: HTTP routes in the table below
src/lib/db.ts, src/lib/fund.ts         Angelo: SQLite and fund calculations
src/lib/types.ts                       Shared: agreed request and response types
scripts/fetch_prices.py               Angelo: AKShare price cache
```

Kellen can finish the layout with the sample JSON below while the routes are being built. She should keep API calls in a small frontend data module so mock responses can be replaced with `fetch('/api/...')` calls without changing the page components. The backend owns the rule checks, approval restriction, fills, and money calculations; the frontend only displays returned values and formats cents as dollars.

## Demo rules

- USD only; fixed list of US stocks; whole shares (lot size 1); one S&P 500 benchmark.
- Starting cash: USD 1,000,000. Position limit: 10% of NAV. Sector limit: 30% of NAV. Fee: 0.10% of fill value.
- Two demo committee users: `kellen` and `angelo`. The user switcher supplies `actorId` in write requests. There is no login in the local demo; real authentication must replace this before public use.
- The first demo supports buy orders. The Sell control can be disabled or hidden until sell calculations are ready.
- The dashboard demo shows since-start performance against the S&P 500. Extra periods and benchmarks in the design can be hidden for now.
- An invalid order is not saved; the API returns the failed checks. A committee rejection is a saved order with status `REJECTED`.
- An approved order fills at the next trading day's closing price when the demo valuation is run. A fill adds a ledger row; no ledger row is edited or deleted. Running valuation twice for the same date must not fill an order twice.
- `requestedAmountCents` is fixed at submission from the latest NAV and `sizePercent`. `freeCashCents` is cash less pending and approved buy commitments; the cash check must allow for the fill fee too.
- All API money fields are **integer US cents** (`6000000` means USD 60,000.00). Percent fields are numbers in percent units (`6` means 6%, not 0.06). Dates use `YYYY-MM-DD`; timestamps use ISO 8601 UTC.

## Routes

| Method and route | Used by | Purpose |
| --- | --- | --- |
| `GET /api/instruments?q=jnj` | Enter order | Search the fixed instrument list |
| `POST /api/orders/preview` | Enter order | Show rule checks without saving |
| `POST /api/orders` | Enter order | Validate and create a pending order |
| `GET /api/orders` | Orders | List orders and their statuses |
| `POST /api/orders/{id}/decision` | Orders | Approve, reject, or cancel a pending order |
| `POST /api/valuation` | Demo control | Fill eligible approved orders and save a daily snapshot |
| `GET /api/dashboard` | Dashboard | Latest NAV, cash, performance, holdings, sectors, chart, and trade history |

No separate backend server is needed. The route files go under `src/app/api/`. For the first demo, the valuation button can be small; the full Valuation, Ledger, and Settings pages are outside Kellen's three-screen scope.

## Shared data shapes and examples

### Instrument search

`GET /api/instruments?q=jnj` returns:

```json
{
  "instruments": [
    { "ticker": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE", "currency": "USD", "sector": "Health Care", "type": "STOCK", "lotSize": 1 }
  ]
}
```

An empty search returns the fixed list. No match returns `{ "instruments": [] }`.

### Rule preview

`POST /api/orders/preview` body:

```json
{ "ticker": "JNJ", "side": "BUY", "sizePercent": 6 }
```

Response:

```json
{
  "allowed": true,
  "estimatedAmountCents": 6000000,
  "checks": [
    { "code": "POSITION_LIMIT", "label": "Position weight 6.0% (limit 10%)", "status": "PASS" },
    { "code": "SECTOR_LIMIT", "label": "Health Care 6.0% (limit 30%)", "status": "PASS" },
    { "code": "CASH", "label": "Cash available for USD 60,000", "status": "PASS" },
    { "code": "SHARES_HELD", "label": "Shares held to sell", "status": "NA" },
    { "code": "INSTRUMENT_TYPE", "label": "Instrument type allowed (stock)", "status": "PASS" }
  ]
}
```

`status` is `PASS`, `FAIL`, or `NA`. A failed preview has `allowed: false` and at least one `FAIL`; the frontend shows the failed label and disables Submit. The backend repeats these checks on submission, since a preview can become stale.

### Orders

`POST /api/orders` body:

```json
{ "actorId": "kellen", "ticker": "JNJ", "side": "BUY", "sizePercent": 6, "pitch": "J&J pharma pipeline", "rationale": "Defensive earnings and a steady dividend." }
```

`pitch` and `rationale` are required. `sizePercent` must be greater than zero and may have up to two decimal places.

Success: HTTP 201 with the same `order` shape used in `GET /api/orders`:

```json
{
  "order": {
    "id": "ord_001",
    "createdAt": "2026-11-04T19:00:00Z",
    "instrument": { "ticker": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE", "currency": "USD", "sector": "Health Care", "type": "STOCK", "lotSize": 1 },
    "side": "BUY",
    "sizePercent": 6,
    "requestedAmountCents": 6000000,
    "pitch": "J&J pharma pipeline",
    "rationale": "Defensive earnings and a steady dividend.",
    "submittedBy": { "id": "kellen", "name": "Kellen" },
    "status": "PENDING",
    "decision": null,
    "fill": null
  }
}
```

`GET /api/orders` returns `{ "orders": [/* order objects in newest-first order */] }`. Status values are `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, and `FILLED`.

If submission fails a rule: HTTP 422 with `{ "error": { "code": "MANDATE_VIOLATION", "message": "Would bring JNJ to 15.0% of NAV; limit is 10%." }, "checks": [/* same shape as preview */] }`. No order is created.

### Approval and rejection

`POST /api/orders/ord_001/decision` body:

```json
{ "actorId": "angelo", "action": "APPROVE" }
```

Response: HTTP 200 with `{ "order": /* updated order object */ }`. For rejection, use `action: "REJECT"` and a required `reason`. For cancellation, use `action: "CANCEL"` and a required `reason`; only the submitter can cancel a pending order. Approval and rejection require a different committee member from the submitter. The updated order has `decision: { "action": "APPROVE", "by": { "id": "angelo", "name": "Angelo" }, "at": "2026-11-04T19:30:00Z", "reason": null }`.

Self-approval returns HTTP 403 with `{ "error": { "code": "SELF_APPROVAL", "message": "You cannot approve your own order." } }`. An order that is no longer pending returns HTTP 409 with `code: "INVALID_STATUS"`.

### Valuation

`POST /api/valuation` body is `{ "date": "2026-11-05" }`, where the date is the US trading date whose closing prices are cached. Response:

```json
{
  "run": {
    "date": "2026-11-05",
    "status": "SUCCESS",
    "filledOrderIds": ["ord_001"],
    "navCents": 99994000,
    "cashCents": 93994000
  }
}
```

This example assumes JNJ closes at USD 200.00: a USD 60,000 order buys 300 whole shares, costs USD 60.00 in fees, leaves USD 939,940 cash, and makes NAV USD 999,940. Running the same date again returns the saved run without adding another fill or ledger row. The AKShare script only refreshes locally cached prices; it is not another web server.

### Dashboard

`GET /api/dashboard` returns the latest saved snapshot. The example below is after the valuation above:

```json
{
  "asOf": "2026-11-05",
  "fund": { "baseCurrency": "USD", "navCents": 99994000, "cashCents": 93994000, "freeCashCents": 93994000 },
  "performance": { "fundSinceStartPercent": -0.006, "benchmarkName": "S&P 500", "benchmarkSinceStartPercent": 0.1, "excessSinceStartPercent": -0.106 },
  "chart": [
    { "date": "2026-11-04", "fundIndex": 100, "benchmarkIndex": 100 },
    { "date": "2026-11-05", "fundIndex": 99.994, "benchmarkIndex": 100.1 }
  ],
  "holdings": [
    { "ticker": "JNJ", "name": "Johnson & Johnson", "quantity": 300, "lastPriceCents": 20000, "valueCents": 6000000, "weightPercent": 6.0, "returnPercent": 0 }
  ],
  "sectorBreakdown": [
    { "sector": "Health Care", "weightPercent": 6.0 },
    { "sector": "Cash", "weightPercent": 94.0 }
  ],
  "recentTrades": [
    { "id": "trade_001", "date": "2026-11-05", "type": "FILL", "ticker": "JNJ", "side": "BUY", "quantity": 300, "priceCents": 20000, "feeCents": 6000, "orderId": "ord_001", "pitch": "J&J pharma pipeline" }
  ]
}
```

The frontend formats cents as USD and rounds displayed percentages; it does not calculate NAV or trade quantities. If no valuation has run, the dashboard returns the starting-cash snapshot with empty holdings and trades.

## Error format

All other errors use `{ "error": { "code": "SHORT_MACHINE_CODE", "message": "Readable explanation." } }`. The UI displays `message`. The server is the source of truth for rule checks, self-approval, fills, and money calculations.
