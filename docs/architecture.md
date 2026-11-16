# Architecture

Status: **as built** (in-browser stand-in backend). The target server architecture appears at the end.

```mermaid
flowchart LR
  subgraph Browser["Browser (single-file build)"]
    subgraph Edge["Simulated edge gateway (src/backend/edge.ts)"]
      SIM[SimulatorAdapter<br/>implements SensorAdapter<br/>seeded, scenario-driven] --> OB[(Bounded outbox<br/>JSONL lines, cap 1500)]
    end
    OB -- "batch flush (link state aware)" --> ING[Ingestion pipeline<br/>ingest.ts]
    ING -->|validate schema/provenance/unit/time| Q[(Integrity events +<br/>quarantine)]
    ING -->|idempotent insert| DB[(In-memory store<br/>store.ts: indexes by event_id,<br/>stream#seq, astronaut|type)]
    ING --> RULES[Deterministic rules<br/>rules.ts] --> AL[(Alerts + lifecycle)]
    ING --> BUS[Bounded fan-out<br/>bus.ts, resumable cursor]
    API[API layer api.ts / reports.ts<br/>session + CSRF + permission matrix<br/>+ object-level scope] --> DB
    API --> AL
    UI[React UI<br/>pages/*, ui/*] -->|useApi: batched 1 Hz| API
    BUS --> UI
  end
```

## Data flow
1. `SimulatorAdapter.poll()` emits envelopes (schema 1.0) with `data_origin=simulated`, `simulation_scenario_id`, seed, and simulator version.
2. The gateway appends each envelope to a bounded outbox. When the outbox is full, the generator does a **safe stop** and raises an `outbox_full` integrity event. Nothing is discarded.
3. `flush()` behaves according to link state: `connected` sends immediately, `delayed` holds events for 45 s, `degraded` drops 40% of send attempts (events stay queued), `disconnected` holds everything, and a simulated ground outage retains events.
4. `ingestOne()` validates structure, schema version, provenance, astronaut, measurement type, unit registry, and future-skew. It checks idempotency on both `event_id` and `(stream_id, sequence_number)`: an identical payload is ignored, a different payload is quarantined, and neither record is overwritten. It then detects out-of-order arrival and sequence gaps, applies explicit unit conversion only, stores the event, publishes it, and evaluates rules.
5. The UI re-reads through the API at a throttled ≤1 Hz cadence (`emitChange`). Ingestion itself is never throttled.

## Key properties
- **Provenance is structural.** It is required at ingestion and lives in every record, chart, card, alert, and export.
- **Validity, quality, and freshness are separate fields.** Freshness uses per-type policies (`FRESHNESS_POLICIES`). SpO₂ intentionally has no policy, so it shows as `unconfigured`.
- **Monitoring-state aggregation** follows the deterministic order `unavailable > configured_rule_match > degraded > stale > delayed > rules_not_configured > not_evaluated > data_available`, and the UI always shows the per-source breakdown. There is no health score.
- **Chart downsampling is display-only.** Charts show at most 600 points using bucket averaging, gap buckets are preserved as breaks, and raw records are retained.
- **Single-process limitation.** The bus is in-memory, has a 50-subscriber cap, and has no horizontal scaling.

## Target architecture (not built here — BLOCKED by environment)
React SPA → FastAPI (`/api/v1`, sync SQLAlchemy 2, psycopg 3) → PostgreSQL (Alembic). Server sessions in HttpOnly cookies, Argon2id, AES-GCM field encryption with external keys. The edge simulator runs as a separate process with a JSONL spool on disk. WebSocket `/api/v1/ws/telemetry` uses the same resume-cursor semantics as `bus.ts`. The domain modules (`src/domain/*`) and the API function signatures map one-to-one to the planned endpoints (see `api-contracts.md`).
