# Verification report

Run date (UTC): 2026-11-16. Runner: Linux x64 sandbox, Intel Xeon @ 2.60 GHz, 2 cores, Node v20.20.2.
Raw evidence is in `artifacts/verification/`: `vitest-run.txt`, `perf.json`, `typecheck.txt`, `npm-audit.txt`, `build.txt`, `dependency-versions.txt`.

## Commands executed and results
| Command | Tool / version | Result |
|---|---|---|
| `npx vitest run` | vitest 4.1.12 | **62 passed, 0 failed, 0 skipped** (4 files) |
| `npx tsc --noEmit -p .` | TypeScript 5.9.3 | **0 errors** |
| `npm audit` | npm | **0 vulnerabilities** |
| `npm run build` | Vite 7.3.7 + singlefile | **success**, `dist/index.html` 1.84 MB (559 kB gzip) |

### Test suites
- `src/backend/core.test.ts` (27 tests), covering:
  - seed provenance;
  - ingestion: valid, identical replay, conflicting duplicate (event_id and stream/seq), unknown unit, malformed, unsupported schema, missing scenario provenance, future timestamp, garbage payloads, out-of-order, sequence gap, explicit °F→°C conversion;
  - rules: demo alert dedup on replay, poor quality → data-quality only, ack ≠ resolve, resolve note required, 409 stale version, specialist/ops visibility, clinical approval blocked;
  - auth: bad credentials + lockout, hashed passwords, IDOR across roles, CSRF, logout/disable revocation, idle expiry, scoped search, subscription origin/scope/resume;
  - note correction concurrency (409, revision kept);
  - freshness policy states, comparability (pre-flight not comparable; first week comparable; body-mass method mismatch);
  - bounded chart with preserved gap, CSV injection;
  - report authorization at generation and download, with banners;
  - outbox disconnect → backfill replay, restart dedupe, malformed spool surfaced, overflow safe-stop.
- `src/ui/app.test.tsx` (6 tests, jsdom):
  - every visible nav route works (flight surgeon);
  - anatomy keyboard selection (Enter/Space) and "No mapped sensor data";
  - Mission Control sees no medical nav or data;
  - astronaut sees only themself in the crew list;
  - alert acknowledge keeps the alert open and Escalate is disabled;
  - **axe-core: 0 serious/critical violations** on Mission Overview and Vital Signs (color-contrast rule disabled because jsdom has no layout).
- `src/ui/contrast.test.ts` (28 tests): WCAG 2.2 AA token audit. Text pairs ≥ 4.5:1, non-text UI ≥ 3:1. All pass.
- `src/perf/perf.test.ts` (1 test): see below.

### Defects found by testing and fixed
1. Flight surgeons and specialists could discover unassigned crew through `roster.view`. The permission was removed from those roles.
2. An astronaut could download a surgeon-generated report about themselves that had not been shared. Fixed: astronauts can only download reports they generated.
3. axe flagged a dangling `aria-controls` and a disallowed `aria-expanded` on the search input. Fixed with the combobox pattern.
4. SVG colors failed 3:1: selected-region stroke was 2.4:1 and mapped fill vs white was below 3:1. New colors give 4.3:1 and 4.0:1.
5. The seed count assumption (>50k) was wrong; the actual count is 48,114. The threshold and docs were corrected rather than the figure overstated.

## Performance (in-process, node runner)
| Metric | Result | Target | Verdict |
|---|---|---|---|
| Seeded dataset | 6 astronauts, 48,114 measurements, seeded in 337 ms | 10 astronauts / 100k | **Target not met** (reduced for browser memory) |
| History API (300 samples, all windows) | p50 0.94 ms · p95 2.95 ms · max 6.3 ms | p95 < 500 ms | PASS (in-process; excludes network) |
| Crew summary API (100 samples) | p50 0.45 ms · p95 0.57 ms | — | — |
| Ingestion of 12,000 events (20 ev/s × 10 min equivalent) | 753 ms wall (≈15.9k ev/s) | sustain 20 ev/s | PASS |
| Replay of 1,000 queued events | 46 ms | — | — |
| Max chart display points per series | 575 | ≤ 600 (spec ≤ 2,000) | PASS |
| Ingestion-to-visible latency (browser) | — | p95 < 2 s | **NOT RUN** (no browser). Design: ≤1 s batched UI cadence |
| Main-thread long tasks > 50 ms | — | none in steady state | **NOT RUN** |
| 10 concurrent browser sessions | — | 10 | **NOT RUN** |

## Not run / blocked
- Playwright E2E, responsive viewport checks, and rendered-page contrast: **BLOCKED** (Chromium needs libnss3 and other system libraries; no root access).
- Python suites (pytest, Hypothesis, ruff, mypy, bandit, pip-audit): **BLOCKED** (no server backend).
- Clean-machine install: **NOT RUN** separately. `npm ci` relies on the committed lockfile.
- Backup/restore: **BLOCKED**.

No result in this report was estimated or assumed. Anything not executed is marked NOT RUN or BLOCKED.
