# Architecture

```
            ┌──────────────── ml/ (Python) ────────────────┐
 raw data → │ clean → personal baseline → anomaly scores   │ → ml/outputs/*.json
            └──────────────────────────────────────────────┘
                                   │ read at startup
                                   ▼
            ┌────────────── backend/ (Spring Boot) ────────┐
            │ REST API · scoring rules · validation         │ ←→ PostgreSQL
            └──────────────────────────────────────────────┘
                                   │ JSON over HTTP (docs/api-contract.md)
                                   ▼
            ┌────────────── frontend/ (Next.js) ───────────┐
            │ dashboard · body map · check-ins · charts     │
            └──────────────────────────────────────────────┘
```

## Responsibilities

| Part | Owns | Does not do |
| --- | --- | --- |
| ml | Data cleaning, baselines, model training and evaluation, output files | Serve HTTP |
| backend | API, validation, scoring a new check-in, storing readings | Train models |
| frontend | Screens, interaction, charts, offline cache of the last results | Talk to the database directly |

## Mission story: works without Earth

The backend stands in for the spacecraft's onboard server: the crew's devices talk to it, not to Earth. The frontend should keep the latest results and guidance cached so essentials still show if the server is briefly unreachable.

## Decisions log

Record decisions here as one line each, with the date: what was decided and why.

- 2026-11-14: Next.js frontend, Spring Boot backend, Python ML in one monorepo.
