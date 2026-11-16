# Requirements traceability

Status values: PASS (implemented + automated evidence) · PARTIAL · NOT IMPLEMENTED · BLOCKED · NOT TESTED.

Evidence keys:
- **C** = `src/backend/core.test.ts`
- **U** = `src/ui/app.test.tsx`
- **K** = `src/ui/contrast.test.ts`
- **P** = `src/perf/perf.test.ts`
- **B** = `npm run build`

| Requirement | Status | Evidence / note |
|---|---|---|
| Frontend starts / builds with documented commands | PASS | B, README |
| Backend (FastAPI) + PostgreSQL + Alembic migrations | BLOCKED | ADR 0001; in-browser stand-in |
| Every visible nav item opens a working route | PASS | U "every visible nav item…" |
| Unimplemented features hidden/disabled with reason | PASS | Escalate disabled with reason; rule approval disabled; unconfigured families listed |
| Search scoped + paginated | PASS | C "search is scoped"; UI "Show more" |
| Login / logout / session expiry / revocation | PASS | C auth tests |
| Backend-enforced permission matrix + object-level access | PASS (policy) / BLOCKED (true server boundary) | C IDOR tests; threat-model |
| Mission Control / Admin no implicit medical access | PASS | C, U |
| Subscriptions enforce origin, auth, per-astronaut scope; resume | PASS | C subscription test |
| Immutable provenance; simulated records structurally marked | PASS | C seed test; ingestion rejects simulated without scenario |
| Acquisition modes distinguished | PASS | registry + card labels |
| Timestamps (measured / edge / ground) preserved | PASS | data model, cards, reports |
| Duplicate idempotent; conflicting duplicate quarantined | PASS | C ingestion tests |
| Unknown units quarantined; explicit conversion only | PASS | C |
| Missing value vs gap distinct | PASS | `missing_value` validity vs `sequence_gap` / chart breaks; C chart test |
| Validity / quality / freshness separate; per-type freshness policy; unconfigured state | PASS | C freshness test |
| Delayed / stale / backfilled cannot look live | PASS | "Last known value" label, backfilled pill, dashed series |
| Outbox / reconnect / replay; overflow surfaced | PASS | C edge tests |
| Bounded chart points, raw retained | PASS | C, P (575 ≤ 600) |
| Non-clinical disclaimers in app and reports | PASS | U, C report test |
| No invented clinical threshold / diagnosis | PASS | demo rule labelled arbitrary; review |
| Demo rules isolated, versioned, labelled; no clinical approval possible | PASS | C approval test |
| Ack ≠ resolve; resolution note required; 409 on stale version | PASS | C, U |
| Alerts deduplicated on replay | PASS | C |
| Low-quality data → data-quality event, not clinical alert | PASS | C |
| No automatic escalation / messaging | PASS | none exists |
| 2D SVG regions, explicit mapping, "No mapped sensor data", keyboard | PASS | U anatomy test |
| WCAG 2.2 AA contrast (tokens) | PASS | K (programmatic token audit; rendered-page contrast not checked in browser) |
| axe structural a11y | PASS (jsdom) | U axe test: 0 serious/critical |
| Status by text + icon + color | PASS | `components.tsx` pills |
| Responsive at 1440/1280/1024/768/390/360 | NOT TESTED | no runnable browser; responsive classes implemented |
| Reduced motion | PARTIAL | `MotionConfig reducedMotion="user"` + CSS media query; not browser-tested |
| Historical charts from store data | PASS | `history()` API |
| Baseline comparability safeguards | PASS | C comparability test |
| Sleep/exercise derived values labelled; recovery unconfigured | PASS | Wellness page |
| Radiation quantities separate; gaps; cumulative not configured | PASS | Radiation page; reports |
| PDF/CSV with provenance, units, timestamps, quality, gaps; CSV injection | PASS | C report + csvEscape tests |
| Reports authorized at generation and download | PASS | C |
| Notes versioned with correction trail; optimistic concurrency | PASS | C notes test |
| Audit logging without secrets | PASS (application-level) | `audit()`; Settings → Audit |
| Performance profile measured | PARTIAL | P (in-process API + ingestion); browser metrics NOT TESTED |
| Playwright E2E | BLOCKED | B2 in assumptions |
| Python lint/type/security scans (ruff, mypy, bandit, pip-audit) | BLOCKED | no Python backend |
| npm audit / tsc | PASS | artifacts/verification |
| Backup / restore | BLOCKED | volatile store |
| Encryption at rest / field encryption | BLOCKED | threat-model |
