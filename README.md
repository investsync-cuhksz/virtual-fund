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

A paper portfolio the club runs, with every decision recorded and measured against the market. No real money is involved. Research pitches stocks, an investment committee decides, and the system records each decision and measures the fund against its benchmarks. Past trades can never be edited, which is what makes the track record trustworthy.

## Team

- Kellen Joudan ([@kellenjoudan](https://github.com/kellenjoudan))
- Christian Angelo V
- Karel Hutajulu ([@karelhutajulu](https://github.com/karelhutajulu)), CTO

## Core features

- **Fund settings:** starting capital, base currency, allowed instruments, position and sector limits, benchmarks and fee rate, with every change logged
- **Instrument search** across Hong Kong, mainland China and US listings
- **Order entry and approval:** one committee member enters an order with a rationale, a second one approves it
- **Mandate checks:** orders that break position, sector, cash or instrument rules are rejected with a reason
- **Automatic fills** at the next trading day's close, rounded to the board lot, fees deducted
- **Append-only trade ledger:** mistakes are fixed with reversing rows, never edits
- **Nightly valuation job:** prices, FX, fills, dividends, splits, NAV and a daily snapshot
- **Performance and dashboard:** returns vs. benchmarks, holdings, sector breakdown and trade history linked to each pitch
- **Tests** for fill quantity, fees, NAV and returns, checked against hand-calculated examples
- **Data module:** prices, FX and index levels via [AKShare](https://github.com/akfamily/akshare), cached locally

## Deliverable

A committee member enters an order, another approves it, it fills automatically at the next close, the NAV updates, and the dashboard shows the result. All money calculations are covered by passing tests.

## Getting started

_To be added: setup, how to run, and an architecture diagram._

## References

- [SMU Student Managed Investment Fund](https://vivace.smu.edu.sg/explore/academic-based/smu-student-managed-investment-fund-smu-smif)
- [Purdue SMIF holdings](https://www.purduesmif.org/holdings)
- [Hofstra SMIF portfolio](https://www.hofstra.edu/student-managed-investment-fund/portfolio.html)
- [Aachen Investment Club, capital-team](https://github.com/aachen-investment-club/capital-team)
