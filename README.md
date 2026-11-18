<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/investsync-cuhksz/.github/main/assets/investsync-logo-dark.png">
    <img src="https://raw.githubusercontent.com/investsync-cuhksz/.github/main/assets/investsync-logo.png" alt="InvestSync" height="56">
  </picture>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/investsync-cuhksz/.github/main/assets/cuhksz-logo-dark.png">
    <img src="https://raw.githubusercontent.com/investsync-cuhksz/.github/main/assets/cuhksz-logo.png" alt="The Chinese University of Hong Kong, Shenzhen" height="56">
  </picture>
</p>

# Virtual Fund

**Project #1 · InvestSync Technology**

Virtual Fund is a paper portfolio for the club: members can propose stock trades, approve each other's decisions, and see how the fund performs. It uses simulated money. No brokerage account or real trade is involved.

## What works today

- The local fund starts with **USD 1,000,000** and a fixed list of five US stocks. One stock may be at most **10%** of fund value and one sector at most **30%**. Each fill pays a **0.10%** fee.
- A committee member enters a buy or sell order with a pitch and rationale. Another member must approve it. The person who entered it cannot approve it themselves.
- The app checks position, sector, cash, and available shares before saving an order. Pending sells reserve shares, so two orders cannot sell the same shares.
- An approved order fills when someone runs the demo valuation for an eligible US trading date. Buys use whole shares; sells use a fixed number of whole shares chosen when the order is submitted. Both use that date's simulated closing price.
- The dashboard shows cash, holdings, fund value (NAV), sector weights, and performance against a simulated S&P 500 benchmark. The ledger lists every buy and sell fill, newest first.
- Orders, decisions, fills, valuation snapshots, and an order event history persist in a local SQLite database. The app exposes each order's event history at `GET /api/orders/{id}/events`; older local orders have reconstructed events marked `backfilled`.

## Try the demo

Use **Node.js 20.9 or newer** and npm:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The real local API is used by default; set `NEXT_PUBLIC_USE_MOCK=true` in a local `.env` file only if you want the browser-only sample data.

1. On **Enter order**, act as Kellen and submit a buy order for JNJ with a size of 6%, a pitch, and a rationale.
2. Switch to Angelo on **Orders** and approve it. An order cannot be approved by its submitter.
3. On **Valuation**, run the prefilled next demo trading date. The order fills at that date's simulated close.
4. Check the new holding, cash, and performance on **Dashboard**, then open **Ledger** to see the fill.
5. Submit a sell order for some of the held JNJ shares, have the other member approve it, and run the next valuation date. The ledger keeps both fills.

Demo closing prices and benchmark levels cover **4 November to 4 December 2026**. The valuation page shows the available range. A date without demo prices returns an error and saves nothing. Running the same date twice does not create a second fill.

## How it works

The screens and API run in the **same Next.js app**. A screen asks the API for data; the API checks the fund rules and saves orders and results in SQLite. Simulated dated market prices come from `src/lib/market-data.ts`.

```text
Screens → API routes → fund rules → SQLite
                       ↑
             simulated market closes
```

Order size is entered as a percentage of the fund's latest value. The API records the requested dollar amount when the order is submitted. For a sell, it also fixes the share count using the latest saved price; the sale proceeds use the price on the fill date. A valuation run applies eligible approved orders, deducts fees, updates cash and holdings, and saves a daily snapshot. Ledger fills and order events are appended rather than edited. Money sent through the API is stored as integer US cents.

The local database is `data/virtual-fund.sqlite` and is ignored by Git. Stop the app and delete that file to reset your own demo; this does not affect anyone else's copy.

## For contributors

Pages are in `src/app/`, API routes in `src/app/api/`, fund calculations and market data in `src/lib/`, and API workflow tests in `tests/`. The [demo build spec](docs/DEMO_BUILD_SPEC.md) has request and response examples. Keep rule checks and money calculations on the server so every screen sees the same result.

Before opening a pull request, run:

```bash
npm run lint
npm run build
npm run test:api
```

The API tests use temporary databases and do not change your local demo. Run the build before `test:api`, which starts the built app on a temporary port.

## Still to build

This is a local demo with two selectable committee identities, not a login system. It does not yet host a shared club fund or use live prices. Later work includes website login, configurable fund settings, Hong Kong and mainland China listings with FX and board lots, an AKShare-backed price cache, scheduled valuation, dividends and splits, and ledger corrections. The current ledger is read-only and contains fills.
