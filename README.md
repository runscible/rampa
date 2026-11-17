# Rampa payments reconciliation

A small Nest.js service that reconciles a USDT → Bs payment flow. A partner prefunds in USDT, the local provider converts to Bs and holds the balance, and we pay Bolivian QR codes from it. The service ingests what each side reports, keeps a double-entry ledger, and tells you what does not add up.

Design notes for contributors are in [`ARCHITECTURE.md`](ARCHITECTURE.md); the assignment is in [`BRIEF.md`](BRIEF.md).

## What this service is, and what it is not

It is the **book of record and auditor** of the flow: it keeps what each party reported, derives the ledger and the balances from it, and says what does not add up. It is a source of facts, not a decision maker.

**It is responsible for**
- Keeping every delivery from the four feeds, in arrival order, without rewriting anything.
- Deriving the double-entry ledger and the balances from that log, always the same way.
- Following each pay-out through its lifecycle, saying how far it got, and making that available per operation so other services can decide.
- Reporting what does not reconcile, with the reason, without correcting it: the ledger records what the provider said, and the break says it is wrong.

**It is not responsible for** moving money, deciding or running rollbacks and compensations, retrying pay-outs, talking to the provider or authorising anything. Other services do that: they read these facts and decide. The only rollback that belongs here is the ingestion itself (a request is all or nothing). A provider-side reversal is recorded as a compensating entry, never by deleting anything.

**What callers can rely on**
- Input: sending the same data again changes nothing, the order does not matter, and a request is stored completely or not at all.
- Output: every figure is rebuilt from the delivery log, so it can be traced back to events. Events that make no sense are not applied, but they show up as breaks and stay in the history of their pay-out with the reason. What the service cannot corroborate is reported as a break or a review, never smoothed over.

## Run it

```bash
npm install
npm start          # http://localhost:3000  (PORT to change it)
npm test           # unit + e2e tests
npm run output     # regenerate out/ (see below)
```

State is kept in SQLite (`recon.sqlite` in the working directory), so a restart keeps everything. Delete the file to start from scratch.

| Variable | Default | Meaning |
|---|---|---|
| `RECON_CUTOFF` | `2026-10-05T20:00:00-04:00` | Report state as of this instant |
| `RECON_TIME_ZONE` | `America/La_Paz` | Zone used to display instants |
| `RECON_FUNDING_SLA_MINUTES` | `10` | Max delay between a deposit and its funding webhook |
| `RECON_PAYOUT_SLA_MINUTES` | `15` | Max wait between a pay-out CONFIRM and its terminal event |
| `RECON_MAX_SPREAD` | `0.005` | Max provider spread vs. the reference rate (0.5%) |
| `RECON_DB_PATH` | `recon.sqlite` | SQLite file (`:memory:` for a throwaway database; tests use it) |

## API

| Method and path | Body | Answer |
|---|---|---|
| `POST /ingest/deposits` | `text/csv` (`usdt_deposits.csv`) | `{received, stored, ignored}` |
| `POST /ingest/rates` | `text/csv` (`reference_rates.csv`) | same |
| `POST /ingest/funding-webhooks` | JSON array (`funding_webhooks.json`) | same |
| `POST /ingest/payout-events` | JSON array (`payout_events.json`) | same |
| `GET /balances` | | the six balances: USDT unconverted and converted, Bs funded, available, paid out and in flight |
| `GET /breaks` | | breaks report, instants in UTC and local time |
| `GET /ledger` | | every journal entry |
| `GET /report` | | everything: JSON, or plain text with `Accept: text/plain` |
| `GET /payouts/:payoutId` | | one pay-out: its state, every event received (applied or not, and why), the steps that are missing, the Bs it moved in our ledger, and its breaks |
| `GET /payouts` | | every pay-out; `?state=` keeps one state (`PREVIEWED`, `CONFIRMED`, `COMPLETED`, `FAILED`, `REVERSED` or `UNKNOWN`), e.g. `?state=CONFIRMED` for what is still in flight |
| `GET /deposits/:txHash` | | one deposit: what came in, every webhook that converted it, what they credited, and its breaks |

The `GET`s take an optional `?cutoff=<ISO-8601 with offset>` (encode `+` as `%2B`). The default is `RECON_CUTOFF`.

Errors: `422` with the offending lines when any record of an ingest request is invalid (**nothing is stored**, fix the file and send it again); `400` for JSON that does not parse, a bad `cutoff` or an unknown `state`; `404` for a pay-out or a deposit with nothing known by the cutoff; `415` when a CSV feed is not sent as `text/csv`.

```bash
curl -X POST localhost:3000/ingest/deposits         -H 'Content-Type: text/csv'         --data-binary @data/usdt_deposits.csv
curl -X POST localhost:3000/ingest/rates            -H 'Content-Type: text/csv'         --data-binary @data/reference_rates.csv
curl -X POST localhost:3000/ingest/funding-webhooks -H 'Content-Type: application/json' --data-binary @data/funding_webhooks.json
curl -X POST localhost:3000/ingest/payout-events    -H 'Content-Type: application/json' --data-binary @data/payout_events.json
curl localhost:3000/balances
curl -H 'Accept: text/plain' localhost:3000/report
```

## Output of a run

[`out/run-output.txt`](out/run-output.txt) (readable) and [`out/run-output.json`](out/run-output.json) (machine-readable) are what the service answers for the four provided files. `npm run output` produces them through the API itself: it starts the service with a throwaway database, sends the files with `POST /ingest/*` and saves `GET /report`. A test fails if `out/` is out of date, so it always matches the code.

## Results with the provided data (cutoff 20:00, La Paz)

| Balance | Value |
|---|---|
| USDT sent, not yet converted | 1,500.00 |
| USDT converted | 14,500.00 |
| Bs funded | 141,626.50 |
| Bs available at the provider | 12,120.95 |
| Bs paid out | 129,505.55 |
| Bs in pay-outs not final | 3,900.00 |

Breaks: `fw_003` spread 1.20% · `fw_004` webhook 145 min late · 1,500 USDT deposit without webhook · pay-out `P018` stuck 49 min · Bs balance negative 16:26–17:10 (max shortfall 2,480.55) · `P005` reversed (review) · info: `pe_0029` delivered twice, `P009` preview never confirmed.

## Ledger model

Every entry sums to zero in each currency; each account holds one currency. Debit is positive.

| Account | Currency | Holds |
|---|---|---|
| `USDT_WALLET_PENDING` | USDT | USDT received, not yet converted |
| `USDT_CONVERTED` | USDT | USDT the provider converted |
| `PARTNER_PREFUND` | USDT | What the partner funded (credit side of deposits) |
| `BS_PROVIDER_BALANCE` | Bs | Our Bs balance at the provider |
| `BS_PAID_OUT` | Bs | Bs paid out through COMPLETED pay-outs |
| `FX_CLEARING` | Bs | Bs side of the conversion |

| Event | Entry |
|---|---|
| Deposit | Dr `USDT_WALLET_PENDING` / Cr `PARTNER_PREFUND` |
| Funding webhook | USDT: Dr `USDT_CONVERTED` / Cr `USDT_WALLET_PENDING` · Bs: Dr `BS_PROVIDER_BALANCE` / Cr `FX_CLEARING` (using the webhook's `amount_bs`) |
| Pay-out COMPLETED | Dr `BS_PAID_OUT` / Cr `BS_PROVIDER_BALANCE` |
| Pay-out REVERSED | The exact inverse of COMPLETED |
| PREVIEW, CONFIRM, FAILED | No entry (the provider reserves nothing before COMPLETED) |

"Bs in pay-outs not final" is not in the ledger: it is the sum of pay-outs that are CONFIRMED with no terminal event.

## Duplicates and out-of-order events

- **The service keeps a log of deliveries** (in arrival order, tagged by request) and rebuilds every report from it. Nothing is rewritten. Each request is stored in one transaction, and a process handles one ingestion at a time, so two identical requests sent together are stored once.
- **Sending the same data again changes nothing.** A delivery identical to one from an earlier request is dropped. Ids are `tx_hash`, `event_id` and the rate's timestamp.
- **A repeat inside one request is kept and reported** (INFO `DUPLICATE_DELIVERY`, e.g. `pe_0029`). A repeat with different content is a `EVENT_CONFLICT` break and the first delivery wins.
- **Order does not matter.** Feeds can arrive in any order and events in any order within a feed. Pay-out events are replayed sorted by instant, then lifecycle step (PREVIEW < CONFIRM < COMPLETED < FAILED < REVERSED), then event id. At the same instant, deposits are applied before fundings, and fundings before pay-outs.
- **Pay-outs follow a state machine:** PREVIEW → CONFIRM → COMPLETED | FAILED, and COMPLETED → REVERSED. An event that makes no sense (a second COMPLETED with another id, REVERSED without COMPLETED) is rejected and reported, so a pay-out is never debited twice.
- **A pay-out must show every step its state implies.** COMPLETED implies PREVIEW and CONFIRM, FAILED the same, REVERSED also COMPLETED. A step that was never received is a gap in the history (`INCOMPLETE_PAYOUT_CHAIN`, listing all of them, not just the previous one). Steps that move no money (CONFIRM, FAILED) are recorded even when an earlier one is missing, so the pay-out is still counted and timed; what would invent money (a REVERSED with nothing completed) is never applied.

## What counts as a break

| Severity | Type | When |
|---|---|---|
| BREAK | `SPREAD_EXCEEDED` | Provider rate is more than 0.5% below the reference rate in force when the webhook was sent (latest rate at or before its timestamp). Exactly 0.5% is fine. |
| BREAK | `LATE_FUNDING_WEBHOOK` | Webhook more than 10 min after its deposit |
| BREAK | `DEPOSIT_WITHOUT_WEBHOOK` | Deposit with no webhook, older than 10 min at the cutoff |
| BREAK | `UNKNOWN_DEPOSIT` | Webhook for a `tx_hash` that was never deposited |
| BREAK | `AMOUNT_MISMATCH` | Webhook `amount_usdt` differs from the deposit |
| BREAK | `AMOUNT_BS_MISMATCH` | Webhook credits a Bs amount that is more than 0.01 Bs away from `amount_usdt × rate` (rounded half up). The ledger keeps the amount the provider says it credited |
| BREAK | `DOUBLE_FUNDING` | Two different webhooks for one deposit (both are applied) |
| BREAK | `STUCK_PAYOUT` | CONFIRMED more than 15 min before the cutoff, no terminal event |
| BREAK | `PAYOUT_AMOUNT_MISMATCH` | An event of a pay-out carries a different amount than the previous one received (PREVIEW → CONFIRM → COMPLETED or FAILED → REVERSED). One break per deviation. The ledger uses the amount of the COMPLETED and REVERSED events themselves |
| BREAK | `REVERSAL_WITHOUT_COMPLETED` | REVERSED for a pay-out that never completed (not applied) |
| BREAK | `ILLEGAL_TRANSITION` | Any other event that breaks the pay-out lifecycle (not applied) |
| BREAK | `NEGATIVE_BALANCE` | Bs balance at the provider below zero; one break per interval with the maximum shortfall |
| BREAK | `EVENT_CONFLICT` | Same id delivered again with different content |
| REVIEW | `PAYOUT_REVERSED` | A completed pay-out was reversed |
| REVIEW | `INCOMPLETE_PAYOUT_CHAIN` | A pay-out reached a state whose earlier steps were never received (e.g. COMPLETED with no CONFIRM). One break per pay-out naming every missing step. If money moved it is applied to the ledger |
| REVIEW | `MISSING_REFERENCE_RATE` | No rate at or before the webhook: the spread cannot be checked |
| INFO | `DUPLICATE_DELIVERY` | Same id and content twice in one request |
| INFO | `UNCONFIRMED_PREVIEW` | PREVIEW never confirmed (no financial effect) |

Limits are inclusive (a delay of exactly 10 minutes is not a break).

## Assumptions

- **The ledger records the Bs the webhook says it credited** (`amount_bs`). If that does not match `amount_usdt × rate`, it is a break; the entry is not corrected.
- **A negative Bs balance can happen.** The provider debits at COMPLETED and reserves nothing, so a pay-out can complete without funds. The ledger records it as is and it shows up as a break.
- **Spread** is `(reference − provider rate) / reference`. A rate better than the reference is not a break.
- **A COMPLETED with an incomplete history is applied.** The provider debits when it completes, whatever steps we did or did not receive, so leaving it out would overstate the available balance. The gap is reported for review instead. A pay-out whose events carry different amounts is applied with the amount of each COMPLETED and REVERSED event, which is what the provider moved, and flagged as a break. We do not roll back our books on our own: the provider is the one that executes, and a correction belongs to whoever reviews it.
- **A webhook that arrives after the cutoff does not count** for a deposit "without webhook": the report is as of the cutoff.
- **Timestamps must carry an explicit offset**; one without it is ambiguous and is rejected. Amounts have at most 2 decimals and rates at most 6; extra decimals are rejected, not rounded.
- **Everything after the cutoff is ignored**, including repeats.

## What I would change for production

- Postgres instead of a single SQLite file, with idempotency enforced by the database itself (a unique key per delivery). Today one process serializes its own ingestions, which does not protect two instances writing at once.
- Authenticate callers and verify webhook signatures; rate limits and larger JSON body limits.
- Store the report breaks and notify (alerts on negative balance and stuck pay-outs) instead of only answering on demand; track break lifecycle (open, acknowledged, resolved).
- Page and stream the ledger; ingest files in chunks.
- Take reference rates from a market data source, with their own SLA; the hourly CSV is a stand-in.
- Multi-day cutoffs, closing balances carried across days, and per-partner accounts.
- Observability: structured logs, metrics per feed and per break type, tracing across ingestion and report.
