# Telemetry contract (schema_version 1.0)

The envelope type is `TelemetryEnvelope` in `src/domain/types.ts`, validated by `validateEnvelope` in `src/backend/ingest.ts`.

| Field | Rule |
|---|---|
| event_id | required, globally unique, immutable |
| schema_version | must be in `SCHEMA_VERSIONS_SUPPORTED` (`1.0`); otherwise **rejected** (`unsupported_schema`) |
| astronaut_id / mission_id | astronaut must exist; never trusted for authorization |
| sensor_id, stream_id | required |
| sequence_number | non-negative integer or null; monotonic per stream |
| measurement_type | must be in the registry; otherwise **quarantined** |
| raw_value / raw_unit | finite number or null. The unit must be in `allowedUnits`; otherwise **quarantined** (`unknown_unit`), with no unit inferred |
| measured_at | ISO-8601 UTC. If it is more than 5 s in the future (technical skew tolerance) it is **quarantined**, and the original is preserved |
| received_at_edge / received_at_ground | stored separately. Ground receipt is assigned at ingestion |
| timestamp_source, clock_uncertainty_ms | stored as received |
| data_origin | one of simulated/device/manual/imported/derived. `simulated` requires `simulation_scenario_id`, otherwise **rejected** |
| validity_state, quality_state | separate enums |
| measurement_method, device_class, measurement_context, mission_phase | required |

## Idempotency and conflicts
- If the same `event_id` or the same `(stream_id, sequence_number)` arrives with an **identical source payload hash**, it is ignored as a duplicate. No new record and no new alert are created.
- If the same key arrives with a **different payload**, it is quarantined (`conflict_quarantined`), an integrity alert (INT-001) is raised, and neither record is overwritten.
- The payload hash covers source fields only. Edge/ground receipt times are excluded, so a legitimate re-send still dedupes.

## Ordering, gaps, backfill
- `seq < max_seq`: the event is stored and flagged `out_of_order`, and the series stays ordered by `measured_at`.
- `seq > max_seq + 1`: a `sequence_gap` integrity event is recorded. Gaps are never interpolated, and charts show them as breaks.
- `backfilled = (replay && lag > 5 s) || lag > 30 s`. The UI and exports label these records and draw them as dashed amber chart lines.

## Live delivery / resume
`subscribe(sid, origin, allowlist, astronautIds, sinceCursor)` checks the origin, authenticates, and authorizes each astronaut. If `sinceCursor > 0` it replays in ingest order as `backfill`. Access is re-checked on every delivery, and the subscription closes when the session expires or access is revoked.

## Edge outbox
Bounded at 1,500 lines. A full outbox safe-stops the generator without dropping data. A gateway restart re-reads the spool and re-sends the last batch, which the ground dedupes. Malformed spool lines raise `outbox_malformed_record` and are kept for diagnostics.

## Unit conversions
The only conversion is `conv-temp-f-c-v1` (°F → °C for skin temperature). Raw value and unit are preserved alongside `normalized_value`, `normalized_unit`, and `conversion_version`.
