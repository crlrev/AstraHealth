# Data dictionary

All entities are defined in `src/domain/types.ts`. All prototype data is fictional and `data_origin = simulated`.

| Entity | Key fields | Notes |
|---|---|---|
| User | id, username, role, extra_permissions, assigned_astronauts, self_astronaut_id, disabled, salt, password_hash, failed_attempts, locked_until | PBKDF2 hash only, never plaintext |
| Session | id (opaque), user_id, csrf, created_at, last_seen | in memory; 30-min idle expiry |
| Mission | id, name, vehicle, phase, launch_at, planned_days | 2 fictional missions |
| Astronaut | id, display_name, callsign, mission_id, crew_role, assigned_surgeon, shares_self_view | 6 fictional crew |
| SensorDevice | id, device_class, model, firmware, calibration_ref, astronaut_id, body_site, measurement_types | simulated models |
| StoredMeasurement | envelope + received_at_ground, ingest_seq (cursor), backfilled, out_of_order, payload_hash, normalized_* , conversion_version | indexed by event_id, stream#seq, astronaut|type |
| IntegrityEvent | kind, at, stream_id, astronaut_id, event_id, detail, quarantined_payload | quarantine store; payload is never returned by the API |
| AlertRule | id, version, type, category, condition, params, quality_policy, status, simulation_only, author, reviewer, approval_evidence | all `demo_active`; none approved |
| Alert | id, fingerprint, rule_id/version, category, astronaut/stream/source_event, status, assignee, occurrences, version, history[] | fingerprint = astronaut + rule + version + stream + 15-min window |
| Note | id, kind (clinical/operational), astronaut_id, author_id, title, body, version, shared_with_astronaut, revisions[] | corrections keep prior text |
| SleepRecord | start, end, duration_min, status=estimated, method | actigraphy estimate |
| ExerciseRecord | start, duration_min, modality, workload_value + unit, status=measured | units differ per device |
| RadiationMeasurement | quantity (absorbed_dose / dose_equivalent), unit (mGy / mSv), detector, scope (personal/area), interval, status | quantities never combined |
| ReportRecord | type, format, astronaut/mission, interval, generated_at/by, filename, row_count, content | authz checked at generation and download |
| AuditEvent | at, user_id, action, target_type/id, outcome, context | no medical values or secrets |

## Measurement registry (`MEASUREMENTS`)
heart_rate (bpm, continuous), hrv_rmssd (ms, periodic), respiratory_rate (breaths/min, continuous), spo2 (%, periodic, **no freshness policy**), skin_temperature (°C, continuous, accepts °F via explicit conversion; *skin, not core*), bp_systolic / bp_diastolic (mmHg, manual), body_mass (kg, periodic), demo_marker (count, event-based).

**Unconfigured families:** hydration, bone density, muscle status, core temperature, ECG waveform.

## Seed (deterministic, seed 20260214)
48,114 measurements. Resolution is 30 min for older history, 5 min for the last 48 h, and 1 min for the last 6 h. Additional seeded records:
- pre-flight baseline sessions (seated_1g posture, so not comparable with in-flight data);
- a deliberate 3-hour heart-rate gap for AST-003;
- about 1.5% questionable-quality points;
- personal dosimeter gaps for AST-002 on mission days 10, 11 and 18.

The spec targets 100k records and 10 astronauts. The actual figures are 48,114 records and 6 astronauts, kept lower to limit browser memory. The perf profile ingests a further 12,000 events.
