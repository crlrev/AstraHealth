# ASTRAHEALTH — Astronaut Health Monitoring Prototype

> **DEMONSTRATION PROTOTYPE — NOT FOR CLINICAL USE.**
> **SIMULATED DATA — NOT REAL ASTRONAUT TELEMETRY.**
> Not a medical device, not flight-qualified, not certified, not validated. It does not diagnose, triage or recommend treatment.

ASTRAHEALTH is an engineering demonstration of telemetry provenance, freshness, idempotent store-and-forward ingestion, role/scope-based access control, deterministic demo alert workflows, and an anatomical monitoring UI.

## Important deviation from the specification

The workspace supplied for this build is a **static React 19 + Vite 7 + Tailwind 4 single-file template**. Only `dist/index.html` is served, and no Python runtime, PostgreSQL, or Docker service can be run behind it. So the specified FastAPI/PostgreSQL/Alembic backend is **BLOCKED** here. It is replaced by an **in-browser stand-in backend** (`src/backend/*`) that implements the same logical contracts: sessions, CSRF, permission matrix, object-level authorization, ingestion, deduplication, quarantine, rules, alerts, notes, reports, and audit. See `docs/decisions/0001-in-browser-backend.md`.

**Because this "server" runs inside the browser, its authorization is NOT a security boundary.** It shows the policy and is fully unit-tested, but a real deployment must move this layer to a server.

## Run

Prerequisites (tested): Node 20.20.2, npm 10.

```bash
npm ci              # install from lockfile
npm run dev         # dev server → http://localhost:5173
npm run build       # production single-file build → dist/index.html
npm run preview     # serve the build → http://localhost:4173
npm test            # vitest: backend, UI integration (jsdom + axe), contrast, perf profile
npx tsc --noEmit -p .   # typecheck
npm audit           # dependency audit
```

No `.env` is needed: there are no secrets, keys, or external services in this static build.

### Demo accounts (DEVELOPMENT ONLY)

All accounts use the password `astra-demo`. They are fictional, are re-created on every page load, and are disabled outside demo mode.

| Username | Role | Scope |
|---|---|---|
| `astro.vega` | Astronaut | self (AST-001) |
| `dr.okafor` | Flight Surgeon | AST-001..004 |
| `dr.mbeki` | Flight Surgeon | AST-005..006 |
| `spec.lindqvist` | Medical Monitoring Specialist | AST-001..006 (monitoring only) |
| `ops.tanaka` | Mission Control Operator | operational only, no medical values |
| `admin.reyes` | System Administrator | accounts/config/audit, no medical values |

### Demo walkthrough

1. Sign in as `dr.okafor` and open Mission Overview to see the crew snapshot, body map, cards, monitoring-state breakdown, and the injected DEMO alert.
2. Click the bell, open the DEMO alert, then **Acknowledge** (it stays open), **Assign**, and **Resolve** (a note is required). Escalate is disabled because no approved procedure is configured.
3. Go to Settings → Simulator and choose **Disconnected**. Wait about 20 s and watch the queue grow. Then choose **Connected / reconnect**: the queued events replay and show as *Backfilled*, as dashed amber lines on the Vital Signs charts.
4. Inject scenarios such as *Conflicting duplicate*, *Unknown unit*, *Poor-quality event*, *Gap*, and *°F conversion*, then check the integrity log.
5. Open Reports, generate a CSV and a PDF, then preview and download them.
6. Sign in as `ops.tanaka` or `astro.vega` and compare what each role can see.

## Workspace map

```
src/domain/      types, config (registries, demo policies, rules, permission matrix), pure logic
src/backend/     in-browser stand-in backend: store+seed, auth, ingest, rules, bus, edge sim, api, reports
src/ui/          app shell, components, body map, measurement cards, alert modal
src/pages/       routes (mission, crew, anatomy, vitals, analytics, wellness, radiation, records, reports, settings)
src/**/*.test.*  automated tests
docs/            architecture, contracts, security, assumptions, ADRs, traceability, verification report
artifacts/verification/  raw test, perf, typecheck and audit outputs
```

Backup/restore: not applicable. The store is volatile and deterministically re-seeded on every load. The PostgreSQL `pg_dump`/restore procedure is **BLOCKED** along with the server backend (see the open questions doc).
