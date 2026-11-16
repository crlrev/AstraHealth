# Assumptions, blockers and open questions

## Environment blockers (verified)
| # | Item | Status | Safe state implemented |
|---|---|---|---|
| B1 | FastAPI / PostgreSQL / Alembic / Docker cannot be served from the static single-file workspace | BLOCKED | In-browser stand-in backend (ADR 0001) |
| B2 | Playwright/Chromium cannot launch: missing system libraries (libnss3, libatk, …), no root to install | BLOCKED | jsdom + React Testing Library + axe-core integration tests instead |
| B3 | Argon2id is unavailable in this template | BLOCKED | PBKDF2-SHA-256 (WebCrypto) |
| B4 | Application-level field encryption needs key management | BLOCKED | No encryption claimed; no real data exists |
| B5 | Durable on-disk edge spool | PARTIAL | JSONL-line outbox in memory; restart/corruption simulated |
| B6 | Backup/restore (`pg_dump`) | BLOCKED | Volatile, deterministic reseed |
| B7 | Visual reference image | Inspected (supplied in brief) | White/light-grey panels, left nav, central body, right vital rail, green accents, adapted without copying branding/content |

## Demonstration-only choices (arbitrary, unapproved)
- Freshness policies (`demo-freshness-v1`). SpO₂ is deliberately left unconfigured.
- Comparability policy (`demo-comparability-v1`).
- Demo rules: DEMO-EVT-001, DEMO-RANGE-HR-001 (upper = 137 bpm, an **arbitrary** value chosen only to exercise the workflow; it is **not** a clinical limit), DQ-QUAL-001, INT-001, LINK-001.
- Future-timestamp skew tolerance of 5 s and outbox capacity of 1,500 (technical, non-clinical).
- Simulated value ranges are synthetic and imply nothing about physiology.

## Require qualified human review (not decided by the coding agent)
1. Clinical thresholds, trend definitions, and false-positive/false-negative trade-offs.
2. Sensor plausibility, calibration, acquisition cadence, and signal-quality semantics.
3. Which measurements are continuous, periodic, manual, or derived in operations.
4. Measurement comparability (device, protocol, posture, mission phase).
5. Radiation quantities, detector semantics, cumulative algorithms, gap treatment, and reference limits. Cumulative dose is shown as **not configured**.
6. Escalation procedures. None are configured, so Escalate is disabled.
7. Mission communications latency, loss, and security requirements.
8. Regulatory/aerospace standards applicability. No compliance is claimed.
9. Production cryptography and key management.
10. Hazard analysis, clinical validation, human factors, and deployment approval.

## Other assumptions
- All UI times are shown in UTC.
- Astronaut self-view of their own measurements counts as "explicitly shared" (`shares_self_view = true` in the seed).
- Viewer-left on the body map is the astronaut's right side, and this is stated in the UI.
