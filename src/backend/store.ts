// In-browser stand-in for the PostgreSQL ground database (see docs/decisions/0001).
// Volatile: re-seeded deterministically on every page load.
import { MEASUREMENTS, SIM_SEED, SIMULATOR_VERSION } from '../domain/config';
import { mulberry32, payloadHash } from '../domain/logic';
import type {
  Alert, Astronaut, AuditEvent, ExerciseRecord, IntegrityEvent, MeasurementType, Mission, Note,
  RadiationMeasurement, ReportRecord, SensorDevice, Session, SleepRecord, StoredMeasurement, User,
} from '../domain/types';

/* ---------------- Clock abstraction ---------------- */
export const clock = {
  fixed: null as number | null,
  now(): number { return this.fixed ?? Date.now(); },
  iso(): string { return new Date(this.now()).toISOString(); },
};

export interface StreamState {
  stream_id: string;
  astronaut_id: string;
  measurement_type: MeasurementType;
  max_seq: number;
  last_measured_at: string | null;
  last_received_at: string | null;
  count: number;
}

export interface DB {
  users: Map<string, User>;
  sessions: Map<string, Session>;
  missions: Mission[];
  astronauts: Astronaut[];
  devices: SensorDevice[];
  measurements: StoredMeasurement[];
  byEventId: Map<string, StoredMeasurement>;
  byStreamSeq: Map<string, StoredMeasurement>;
  bySeries: Map<string, StoredMeasurement[]>; // `${astronaut}|${type}` sorted by measured_at
  streams: Map<string, StreamState>;
  integrity: IntegrityEvent[];
  alerts: Alert[];
  notes: Note[];
  sleep: SleepRecord[];
  exercise: ExerciseRecord[];
  radiation: RadiationMeasurement[];
  audit: AuditEvent[];
  reports: ReportRecord[];
  ingestSeq: number;
  seededAt: number;
}

export const db: DB = emptyDb();

function emptyDb(): DB {
  return {
    users: new Map(), sessions: new Map(), missions: [], astronauts: [], devices: [], measurements: [],
    byEventId: new Map(), byStreamSeq: new Map(), bySeries: new Map(), streams: new Map(), integrity: [],
    alerts: [], notes: [], sleep: [], exercise: [], radiation: [], audit: [], reports: [], ingestSeq: 0, seededAt: 0,
  };
}

export function hashOf(m: StoredMeasurement): string {
  if (!m.payload_hash) m.payload_hash = payloadHash(m as unknown as Record<string, unknown>);
  return m.payload_hash;
}

/** Inserts a record into all indexes (sorted series insert handles out-of-order). */
export function indexMeasurement(m: StoredMeasurement) {
  db.measurements.push(m);
  db.byEventId.set(m.event_id, m);
  if (m.sequence_number !== null) db.byStreamSeq.set(`${m.stream_id}#${m.sequence_number}`, m);
  const key = `${m.astronaut_id}|${m.measurement_type}`;
  let arr = db.bySeries.get(key);
  if (!arr) { arr = []; db.bySeries.set(key, arr); }
  const t = Date.parse(m.measured_at);
  if (!arr.length || Date.parse(arr[arr.length - 1].measured_at) <= t) arr.push(m);
  else {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (Date.parse(arr[mid].measured_at) <= t) lo = mid + 1; else hi = mid; }
    arr.splice(lo, 0, m);
  }
  let s = db.streams.get(m.stream_id);
  if (!s) { s = { stream_id: m.stream_id, astronaut_id: m.astronaut_id, measurement_type: m.measurement_type as MeasurementType, max_seq: -1, last_measured_at: null, last_received_at: null, count: 0 }; db.streams.set(m.stream_id, s); }
  if (m.sequence_number !== null && m.sequence_number > s.max_seq) s.max_seq = m.sequence_number;
  if (!s.last_measured_at || Date.parse(m.measured_at) > Date.parse(s.last_measured_at)) s.last_measured_at = m.measured_at;
  s.last_received_at = m.received_at_ground;
  s.count++;
}

export function seriesInRange(astronautId: string, type: MeasurementType, fromMs: number, toMs: number): StoredMeasurement[] {
  const arr = db.bySeries.get(`${astronautId}|${type}`) ?? [];
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (Date.parse(arr[mid].measured_at) < fromMs) lo = mid + 1; else hi = mid; }
  const out: StoredMeasurement[] = [];
  for (let i = lo; i < arr.length && Date.parse(arr[i].measured_at) <= toMs; i++) out.push(arr[i]);
  return out;
}

export function latestOf(astronautId: string, type: MeasurementType): StoredMeasurement | null {
  const arr = db.bySeries.get(`${astronautId}|${type}`);
  return arr && arr.length ? arr[arr.length - 1] : null;
}

/* ---------------- Seed ---------------- */
const CREW: [string, string, string, string, string, number][] = [
  ['AST-001', 'Mara Vega', 'VEGA', 'Commander', 'MSN-HEL-07', 152],
  ['AST-002', 'Idris Kale', 'KALE', 'Flight engineer', 'MSN-HEL-07', 200],
  ['AST-003', 'Sun-Hee Park', 'PARK', 'Mission specialist', 'MSN-HEL-07', 28],
  ['AST-004', 'Tomás Reyna', 'REYNA', 'Payload specialist', 'MSN-HEL-07', 265],
  ['AST-005', 'Leni Ostrander', 'OSTR', 'Commander', 'MSN-AUR-02', 320],
  ['AST-006', 'Kofi Adjei', 'ADJEI', 'Flight engineer', 'MSN-AUR-02', 95],
];

export const SEED_SCENARIO = 'seed_history_v1';

export function seed(now = clock.now()) {
  Object.assign(db, emptyDb());
  db.seededAt = now;
  const rand = mulberry32(SIM_SEED);
  const day = 86_400_000;
  db.missions = [
    { id: 'MSN-HEL-07', name: 'HELIOS-7 (fictional)', vehicle: 'Orbital Research Station "Meridian" (fictional)', phase: 'in_flight', launch_at: new Date(now - 30 * day).toISOString(), planned_days: 180 },
    { id: 'MSN-AUR-02', name: 'AURORA-2 (fictional)', vehicle: 'Cislunar Habitat "Lumen" (fictional)', phase: 'in_flight', launch_at: new Date(now - 12 * day).toISOString(), planned_days: 60 },
  ];
  db.astronauts = CREW.map(([id, name, callsign, role, mission, hue]) => ({
    id, display_name: name, callsign, crew_role: role, mission_id: mission, nationality_demo: 'Fictional',
    assigned_surgeon: mission === 'MSN-HEL-07' ? 'u-surg1' : 'u-surg2',
    initials: name.split(' ').map((p) => p[0]).join(''), hue, shares_self_view: true,
  }));

  for (const a of db.astronauts) {
    const n = a.id.slice(-3);
    db.devices.push(
      { id: `PATCH-${n}`, device_class: 'wearable_ecg_patch', model: 'SimPatch S2 (simulated)', firmware: '2.4.1-sim', calibration_ref: `CAL-P-${n}-0412`, astronaut_id: a.id, body_site: 'chest (sternal)', measurement_types: ['heart_rate', 'hrv_rmssd', 'respiratory_rate'] },
      { id: `OXI-${n}`, device_class: 'pulse_oximeter', model: 'SimOx F1 (simulated)', firmware: '1.1.0-sim', calibration_ref: `CAL-O-${n}-0311`, astronaut_id: a.id, body_site: 'right index fingertip', measurement_types: ['spo2'] },
      { id: `BAND-${n}`, device_class: 'wrist_band', model: 'SimBand T (simulated)', firmware: '3.0.2-sim', calibration_ref: `CAL-B-${n}-0220`, astronaut_id: a.id, body_site: 'left wrist', measurement_types: ['skin_temperature'] },
      { id: `CUFF-${n}`, device_class: 'bp_cuff', model: 'SimCuff A (simulated)', firmware: '1.0.9-sim', calibration_ref: `CAL-C-${n}-0105`, astronaut_id: a.id, body_site: 'left upper arm', measurement_types: ['bp_systolic', 'bp_diastolic'] },
      { id: `MMD-${n}`, device_class: 'mass_measurement_device', model: 'SimMass I (simulated)', firmware: '0.9.0-sim', calibration_ref: `CAL-M-${n}-0101`, astronaut_id: a.id, body_site: 'whole body', measurement_types: ['body_mass'] },
    );
  }

  const ctxFlight = { posture: 'microgravity_free_float', protocol: 'routine_monitoring' };
  const ctxPre = { posture: 'seated_1g', protocol: 'preflight_baseline_session' };
  const ctxWrist = { body_site: 'left_wrist' };
  const ctxBP = { body_site: 'left_upper_arm', posture: 'microgravity_restrained' };
  const ctxMassFlight = { method_note: 'inertial (spring-oscillation) in microgravity' };
  const ctxMassPre = { method_note: 'platform scale in 1 g' };

  for (const a of db.astronauts) {
    const mission = db.missions.find((m) => m.id === a.mission_id)!;
    const launch = Date.parse(mission.launch_at);
    const n = a.id.slice(-3);
    const base = { hr: 58 + rand() * 12, rr: 12 + rand() * 3, st: 33.2 + rand() * 1, hrv: 38 + rand() * 30, mass: 62 + rand() * 22 };
    const mk = (type: MeasurementType, sensor: string, streamSuffix: string, seq: number, t: number, value: number | null, opts: Partial<StoredMeasurement> = {}): StoredMeasurement => {
      const def = MEASUREMENTS[type];
      const iso = new Date(t).toISOString();
      const stream = `${a.id}:${type}:${sensor}${streamSuffix}`;
      const recvGround = new Date(t + 1200).toISOString();
      return {
        event_id: `seed-${stream}-${seq}`, schema_version: '1.0', astronaut_id: a.id, mission_id: a.mission_id, sensor_id: sensor,
        stream_id: stream, sequence_number: seq, measurement_type: type, acquisition_mode: def.acquisition_mode,
        raw_value: value, raw_unit: def.unit, measured_at: iso, received_at_edge: new Date(t + 400).toISOString(),
        timestamp_source: def.acquisition_mode === 'manual' ? 'manual_entry' : 'sensor_clock', clock_uncertainty_ms: 50,
        data_origin: 'simulated', simulation_scenario_id: SEED_SCENARIO, simulator_version: SIMULATOR_VERSION, seed: SIM_SEED,
        validity_state: 'valid', quality_state: 'good', measurement_method: def.method, device_class: def.device_class,
        measurement_context: ctxFlight, mission_phase: 'in_flight', received_at_ground: recvGround, ingest_seq: ++db.ingestSeq,
        backfilled: false, out_of_order: false, payload_hash: '', normalized_value: value, normalized_unit: value === null ? null : def.unit,
        conversion_version: null, ...opts,
      };
    };
    // Continuous / periodic streams with variable resolution history
    const times: number[] = [];
    for (let t = launch; t < now - 48 * 3600e3; t += 30 * 60e3) times.push(t);
    for (let t = now - 48 * 3600e3; t < now - 6 * 3600e3; t += 5 * 60e3) times.push(t);
    for (let t = now - 6 * 3600e3; t < now - 20e3; t += 60e3) times.push(t);
    const gapStart = now - 2 * day - 3 * 3600e3, gapEnd = now - 2 * day; // deliberate gap for AST-003
    const seqs: Record<string, number> = {};
    const next = (k: string) => (seqs[k] = (seqs[k] ?? -1) + 1);
    for (const t of times) {
      if (a.id === 'AST-003' && t > gapStart && t < gapEnd) continue;
      const circ = Math.sin(((t / 3600e3) % 24) / 24 * Math.PI * 2);
      const q = rand();
      const quality = q > 0.985 ? 'questionable' : 'good';
      indexMeasurement(mk('heart_rate', `PATCH-${n}`, '', next('hr'), t, Math.round(base.hr + circ * 6 + (rand() - 0.5) * 8), { quality_state: quality, validity_state: quality === 'good' ? 'valid' : 'questionable' }));
      indexMeasurement(mk('respiratory_rate', `PATCH-${n}`, '', next('rr'), t, Math.round(base.rr + circ * 1.5 + (rand() - 0.5) * 2)));
      indexMeasurement(mk('skin_temperature', `BAND-${n}`, '', next('st'), t, +(base.st + circ * 0.4 + (rand() - 0.5) * 0.3).toFixed(1), { measurement_context: ctxWrist }));
      if (Math.round(t / 60e3) % 30 === 0 || t < now - 6 * 3600e3) indexMeasurement(mk('hrv_rmssd', `PATCH-${n}`, '', next('hrv'), t, Math.round(base.hrv - circ * 6 + (rand() - 0.5) * 10)));
    }
    // SpO2 hourly (freshness policy intentionally unconfigured)
    for (let t = launch; t < now - 30 * 60e3; t += 3600e3) indexMeasurement(mk('spo2', `OXI-${n}`, '', next('spo2'), t, Math.round(96 + rand() * 3)));
    // BP daily manual
    for (let d = 0; d < Math.floor((now - launch) / day); d++) {
      const t = launch + d * day + 8 * 3600e3;
      if (t > now) break;
      const s = next('bp');
      indexMeasurement(mk('bp_systolic', `CUFF-${n}`, '', s, t, Math.round(108 + rand() * 16), { measurement_context: ctxBP }));
      indexMeasurement(mk('bp_diastolic', `CUFF-${n}`, '', s, t, Math.round(66 + rand() * 12), { measurement_context: ctxBP }));
    }
    // Body mass weekly (in-flight inertial) + pre-flight scale (not comparable)
    for (let t = launch + 2 * day; t < now; t += 7 * day) indexMeasurement(mk('body_mass', `MMD-${n}`, '', next('mass'), t, +(base.mass - (t - launch) / day * 0.03 + (rand() - 0.5) * 0.4).toFixed(1), { measurement_context: ctxMassFlight }));
    for (let i = 0; i < 3; i++) indexMeasurement(mk('body_mass', `SCALE-${n}`, ':preflight', i, launch - (20 - i * 7) * day, +(base.mass + 0.6 + (rand() - 0.5) * 0.4).toFixed(1), { measurement_method: 'Calibrated platform scale, 1 g (simulated)', device_class: 'platform_scale', measurement_context: ctxMassPre, mission_phase: 'pre_flight' }));
    // Pre-flight baseline sessions (different posture/phase -> not comparable with in-flight)
    for (let i = 0; i < 20; i++) {
      const t = launch - (14 - i * 0.6) * day;
      indexMeasurement(mk('heart_rate', `PATCH-${n}`, ':preflight', i, t, Math.round(base.hr + 4 + (rand() - 0.5) * 6), { measurement_context: ctxPre, mission_phase: 'pre_flight' }));
      indexMeasurement(mk('respiratory_rate', `PATCH-${n}`, ':preflight', i, t, Math.round(base.rr + (rand() - 0.5) * 2), { measurement_context: ctxPre, mission_phase: 'pre_flight' }));
      indexMeasurement(mk('hrv_rmssd', `PATCH-${n}`, ':preflight', i, t, Math.round(base.hrv + 5 + (rand() - 0.5) * 8), { measurement_context: ctxPre, mission_phase: 'pre_flight' }));
    }

    // Sleep (estimated, actigraphy) — some nights missing
    for (let d = 1; d < Math.floor((now - launch) / day); d++) {
      if (rand() < 0.08) continue;
      const start = launch + d * day - 2 * 3600e3 + rand() * 3600e3;
      const dur = Math.round(330 + rand() * 120);
      db.sleep.push({ id: `SLP-${a.id}-${d}`, astronaut_id: a.id, start: new Date(start).toISOString(), end: new Date(start + dur * 60e3).toISOString(), duration_min: dur, status: 'estimated', method: 'Wrist actigraphy estimate (simulated)', device_class: 'wrist_band', data_origin: 'simulated', simulation_scenario_id: SEED_SCENARIO });
    }
    // Exercise
    const mods: ExerciseRecord['modality'][] = ['treadmill', 'cycle_ergometer', 'resistive_device'];
    for (let d = 0; d < Math.floor((now - launch) / day); d++) {
      for (let k = 0; k < 2; k++) {
        if (rand() < 0.15) continue;
        const modality = mods[Math.floor(rand() * 3)];
        db.exercise.push({ id: `EXR-${a.id}-${d}-${k}`, astronaut_id: a.id, start: new Date(launch + d * day + (10 + k * 6) * 3600e3).toISOString(), duration_min: Math.round(30 + rand() * 45), modality, workload_value: modality === 'resistive_device' ? Math.round(1500 + rand() * 2500) : Math.round(80 + rand() * 120), workload_unit: modality === 'resistive_device' ? 'kg·rep (device log)' : 'W (mean, device log)', status: 'measured', method: 'Exercise device log (simulated)', data_origin: 'simulated', simulation_scenario_id: SEED_SCENARIO });
      }
    }
    // Personal radiation dosimeter: absorbed dose per 24 h interval. AST-002 has missing intervals.
    for (let d = 0; d < Math.floor((now - launch) / day); d++) {
      if (a.id === 'AST-002' && (d === 9 || d === 10 || d === 17)) continue;
      db.radiation.push({ id: `RAD-P-${a.id}-${d}`, astronaut_id: a.id, mission_id: a.mission_id, quantity: 'absorbed_dose', unit: 'mGy', value: +(0.2 + rand() * 0.2).toFixed(3), detector_class: 'personal_passive_dosimeter', detector_id: `DOS-${n}`, scope: 'personal', interval_start: new Date(launch + d * day).toISOString(), interval_end: new Date(launch + (d + 1) * day).toISOString(), status: 'measured', location: null, data_origin: 'simulated', simulation_scenario_id: SEED_SCENARIO });
    }
  }
  // Area monitors: dose equivalent per interval (separate quantity — never merged with absorbed dose)
  for (const m of db.missions) {
    const launch = Date.parse(m.launch_at);
    for (const loc of ['Module A', 'Sleep station']) {
      for (let d = 0; d < Math.floor((now - launch) / day); d++) {
        db.radiation.push({ id: `RAD-A-${m.id}-${loc}-${d}`, astronaut_id: null, mission_id: m.id, quantity: 'dose_equivalent', unit: 'mSv', value: +(0.4 + rand() * 0.35).toFixed(3), detector_class: 'area_tissue_equivalent_counter', detector_id: `AREA-${m.id.slice(-2)}-${loc === 'Module A' ? 'A' : 'S'}`, scope: 'area', interval_start: new Date(launch + d * day).toISOString(), interval_end: new Date(launch + (d + 1) * day).toISOString(), status: 'measured', location: loc, data_origin: 'simulated', simulation_scenario_id: SEED_SCENARIO });
      }
    }
  }
  // Notes
  db.notes.push(
    { id: 'NOTE-1', kind: 'clinical', astronaut_id: 'AST-001', mission_id: 'MSN-HEL-07', author_id: 'u-surg1', created_at: new Date(now - 3 * day).toISOString(), title: 'Private medical conference (fictional demo note)', body: 'Fictional demonstration note. Routine conference held. No real clinical content.', version: 1, shared_with_astronaut: true, revisions: [] },
    { id: 'NOTE-2', kind: 'clinical', astronaut_id: 'AST-002', mission_id: 'MSN-HEL-07', author_id: 'u-surg1', created_at: new Date(now - 1 * day).toISOString(), title: 'Follow-up on dosimeter gap (fictional)', body: 'Fictional: personal dosimeter intervals missing on mission days 10, 11 and 18. Data flagged incomplete.', version: 1, shared_with_astronaut: false, revisions: [] },
    { id: 'NOTE-3', kind: 'operational', astronaut_id: 'AST-003', mission_id: 'MSN-HEL-07', author_id: 'u-spec', created_at: new Date(now - 2 * day).toISOString(), title: 'Patch telemetry gap (operational)', body: 'Chest patch stream had a ~3 h gap two days ago (simulated). Patch re-seated per crew log.', version: 1, shared_with_astronaut: false, revisions: [] },
  );
}
