# Architecture

Pragmatic hexagonal architecture. Complements `PLAN.md` (what to build) and `BRIEF.md` (the assignment). Update this file in the same commit that changes a decision.

```
src/
  domain/          pure: no Nest, no IO, no file formats
    shared/        money, decimal, time
    rates/         rate table
    ledger/        journal entries, posting rules
    deposits/      deposit entity + invariants
  application/     use cases over domain objects (reconcile)
  adapters/files/  CSV parsing + file → use case facade
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
- **Adding a source:** one adapter function `row → domain input` plus required columns (`parseTable`); no domain changes.
