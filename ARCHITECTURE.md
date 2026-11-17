# Architecture

Pragmatic hexagonal architecture. Complements `PLAN.md` (what to build) and `BRIEF.md` (the assignment). Update this file in the same commit that changes a decision.

```
src/
  domain/          pure: no Nest, no IO, no file formats
    shared/        money, decimal, time
    rates/         rate table
    ledger/        journal entries, posting rules
    deposits/      deposit entity + invariants
    funding/       funding event entity (provider converts USDT → Bs)
    payouts/       payout event entity + lifecycle state machine
  application/     use cases over domain objects (reconcile)
  adapters/files/  CSV/JSON parsers + file → use case facade
  config/, app.module.ts, main.ts, cli.ts   composition root
test/{domain,application,adapters}/, test/architecture.spec.ts
```

## Decisions

- **Dependency rule:** `adapters → application → domain`, never the reverse. Enforced by `test/architecture.spec.ts` (domain and application must not import adapters or `@nestjs`).
- **Ports only when a second implementation exists.** None yet; the first will be the repository (SQLite behind an interface, `:memory:` in tests).
- **Business rules in the domain, formats in adapters.** Invariants live in domain constructors (e.g. `createDeposit`); adapters only map source fields to domain input.
- **Use cases are pure.** `reconcile(domain objects, config)` has no IO and no clock; the cutoff is injected. Adapters (`reconcileFiles`) parse, call the use case and surface bad rows instead of dropping them.
- **State is derived, not stored.** The ledger is rebuilt from source records on every run, with deterministic entry ids, so re-ingesting is idempotent.
- **Domain dependencies:** decimal.js and luxon only (pure, no IO).
- **Adding a source:** a domain entity with a `createX` factory (invariants + fingerprint), a posting rule if it moves money, an adapter function `record → domain input` (`parseTable` / `parseJsonRecords`), and wiring in `reconcile`.
- **Idempotency is a domain rule:** every source is deduplicated by its id (`dedupeById`): first delivery wins, identical repeats are ignored, differing repeats are reported as conflicts.
- **Payout lifecycle is a state machine** (`payout-state`): events are replayed in a total order (instant, lifecycle step, id), so delivery order never matters. Only accepted events reach the ledger; illegal ones are rejected, and money-moving events that skip a step are applied and flagged as irregular.
- **Ledger order:** entries are sorted by instant only; ties keep source order (deposits, fundings, payouts) via a stable sort.
