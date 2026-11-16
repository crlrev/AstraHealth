// Central configuration. Every value here that could be mistaken for clinical
// guidance is DEMONSTRATION CONFIGURATION — arbitrary, unapproved, and NOT CLINICALLY VALIDATED.
import type {
  AlertRule,
  FreshnessPolicy,
  MeasurementDef,
  MeasurementType,
  Permission,
  Role,
} from './types';

export const SCHEMA_VERSIONS_SUPPORTED = ['1.0'];
export const SIMULATOR_VERSION = 'astra-sim 0.4.0';
export const SIM_SEED = 20260214;
export const DEMO_MODE = true; // demo rules are disabled when false

/** Technical (non-clinical) ingestion policy: tolerated clock skew into the future. */
export const FUTURE_SKEW_TOLERANCE_MS = 5_000;
export const OUTBOX_CAPACITY = 1_500;
export const MAX_CHART_POINTS = 600;
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 60_000;

export const MEASUREMENTS: Record<MeasurementType, MeasurementDef> = {
  heart_rate: { type: 'heart_rate', label: 'Heart rate', short: 'HR', unit: 'bpm', allowedUnits: ['bpm'], acquisition_mode: 'continuous', method: 'Chest ECG patch, R-R derived (simulated)', device_class: 'wearable_ecg_patch', family: 'cardiovascular', decimals: 0 },
  hrv_rmssd: { type: 'hrv_rmssd', label: 'Heart-rate variability (RMSSD)', short: 'HRV', unit: 'ms', allowedUnits: ['ms'], acquisition_mode: 'periodic', method: 'RMSSD over 5-min R-R window (simulated)', device_class: 'wearable_ecg_patch', family: 'cardiovascular', decimals: 0 },
  respiratory_rate: { type: 'respiratory_rate', label: 'Respiratory rate', short: 'RR', unit: 'breaths/min', allowedUnits: ['breaths/min'], acquisition_mode: 'continuous', method: 'Thoracic impedance (simulated)', device_class: 'wearable_ecg_patch', family: 'respiratory', decimals: 0 },
  spo2: { type: 'spo2', label: 'SpO₂', short: 'SpO₂', unit: '%', allowedUnits: ['%'], acquisition_mode: 'periodic', method: 'Fingertip pulse oximetry (simulated)', device_class: 'pulse_oximeter', family: 'respiratory', decimals: 0 },
  skin_temperature: { type: 'skin_temperature', label: 'Skin temperature (wrist)', short: 'Skin T', unit: '°C', allowedUnits: ['°C', '°F'], acquisition_mode: 'continuous', method: 'Wrist thermistor — skin, NOT core (simulated)', device_class: 'wrist_band', family: 'body', decimals: 1 },
  bp_systolic: { type: 'bp_systolic', label: 'Blood pressure — systolic', short: 'SYS', unit: 'mmHg', allowedUnits: ['mmHg'], acquisition_mode: 'manual', method: 'Automated cuff, crew-operated (simulated)', device_class: 'bp_cuff', family: 'cardiovascular', decimals: 0 },
  bp_diastolic: { type: 'bp_diastolic', label: 'Blood pressure — diastolic', short: 'DIA', unit: 'mmHg', allowedUnits: ['mmHg'], acquisition_mode: 'manual', method: 'Automated cuff, crew-operated (simulated)', device_class: 'bp_cuff', family: 'cardiovascular', decimals: 0 },
  body_mass: { type: 'body_mass', label: 'Body mass', short: 'Mass', unit: 'kg', allowedUnits: ['kg'], acquisition_mode: 'periodic', method: 'Inertial mass measurement device (simulated)', device_class: 'mass_measurement_device', family: 'body', decimals: 1 },
  demo_marker: { type: 'demo_marker', label: 'Demo event marker', short: 'DEMO', unit: 'count', allowedUnits: ['count'], acquisition_mode: 'event_based', method: 'Injected by simulator scenario', device_class: 'simulator', family: 'demo', decimals: 0 },
};

/** Measurement families requested by the brief that have NO configured acquisition method. */
export const UNCONFIGURED_FAMILIES = [
  { label: 'Hydration indicators', reason: 'No supported acquisition method has been specified by a qualified source.' },
  { label: 'Bone density assessment', reason: 'Periodic assessment method/cadence not supplied. Not continuously available.' },
  { label: 'Muscle status assessment', reason: 'Periodic assessment method/cadence not supplied. Not continuously available.' },
  { label: 'Core body temperature', reason: 'No core-temperature device configured. Skin temperature is shown separately and is not a substitute.' },
  { label: 'ECG waveform', reason: 'Waveform display deferred; HR is derived from the simulated patch. No diagnostic interpretation is provided.' },
];

/** Unit conversions: explicit, versioned, tested. Nothing else is ever converted. */
export const UNIT_CONVERSIONS: { from: string; to: string; version: string; fn: (v: number) => number }[] = [
  { from: '°F', to: '°C', version: 'conv-temp-f-c-v1', fn: (v) => ((v - 32) * 5) / 9 },
];

/**
 * Freshness policies — DEMO TECHNICAL CONFIGURATION, unapproved. SpO₂ is intentionally left
 * unconfigured to demonstrate the `unconfigured` state.
 */
export const FRESHNESS_POLICIES: Partial<Record<MeasurementType, FreshnessPolicy>> = {
  heart_rate: { measurement_type: 'heart_rate', acquisition_mode: 'continuous', expected_interval_s: 4, fresh_until_s: 30, delayed_until_s: 300, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
  respiratory_rate: { measurement_type: 'respiratory_rate', acquisition_mode: 'continuous', expected_interval_s: 4, fresh_until_s: 30, delayed_until_s: 300, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
  skin_temperature: { measurement_type: 'skin_temperature', acquisition_mode: 'continuous', expected_interval_s: 4, fresh_until_s: 60, delayed_until_s: 600, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
  hrv_rmssd: { measurement_type: 'hrv_rmssd', acquisition_mode: 'periodic', expected_interval_s: 300, fresh_until_s: 900, delayed_until_s: 3600, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
  bp_systolic: { measurement_type: 'bp_systolic', acquisition_mode: 'manual', expected_interval_s: 86400, fresh_until_s: 129600, delayed_until_s: 259200, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
  bp_diastolic: { measurement_type: 'bp_diastolic', acquisition_mode: 'manual', expected_interval_s: 86400, fresh_until_s: 129600, delayed_until_s: 259200, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
  body_mass: { measurement_type: 'body_mass', acquisition_mode: 'periodic', expected_interval_s: 604800, fresh_until_s: 691200, delayed_until_s: 1209600, source: 'demo-freshness-v1 (arbitrary)', approval: 'demo_unapproved' },
};

/** Comparability policy: a baseline comparison is permitted only if all listed keys match. */
export const COMPARABILITY_POLICIES: Partial<Record<MeasurementType, { keys: string[]; source: string }>> = {
  heart_rate: { keys: ['raw_unit', 'measurement_method', 'device_class', 'mission_phase', 'context.posture'], source: 'demo-comparability-v1 (unapproved)' },
  respiratory_rate: { keys: ['raw_unit', 'measurement_method', 'device_class', 'mission_phase', 'context.posture'], source: 'demo-comparability-v1 (unapproved)' },
  hrv_rmssd: { keys: ['raw_unit', 'measurement_method', 'device_class', 'mission_phase', 'context.posture'], source: 'demo-comparability-v1 (unapproved)' },
  skin_temperature: { keys: ['raw_unit', 'measurement_method', 'device_class', 'mission_phase', 'context.body_site'], source: 'demo-comparability-v1 (unapproved)' },
};

export type RegionId =
  | 'head_neurological'
  | 'chest_cardiovascular'
  | 'lungs_respiratory'
  | 'abdomen'
  | 'left_arm'
  | 'right_arm'
  | 'left_leg'
  | 'right_leg';

export const ANATOMY_REGIONS: { id: RegionId; label: string; mapping: { type: MeasurementType; basis: string }[] }[] = [
  { id: 'head_neurological', label: 'Head / neurological', mapping: [] },
  { id: 'chest_cardiovascular', label: 'Chest / cardiovascular', mapping: [
    { type: 'heart_rate', basis: 'Physiological system (sensor: chest patch)' },
    { type: 'hrv_rmssd', basis: 'Physiological system (sensor: chest patch)' },
    { type: 'bp_systolic', basis: 'Physiological system (sensor: upper-arm cuff)' },
    { type: 'bp_diastolic', basis: 'Physiological system (sensor: upper-arm cuff)' },
  ] },
  { id: 'lungs_respiratory', label: 'Lungs / respiratory', mapping: [
    { type: 'respiratory_rate', basis: 'Physiological system (sensor: chest patch impedance)' },
    { type: 'spo2', basis: 'Physiological system (sensor: right fingertip)' },
  ] },
  { id: 'abdomen', label: 'Abdomen', mapping: [] },
  { id: 'left_arm', label: 'Left arm', mapping: [{ type: 'skin_temperature', basis: 'Sensor site: left wrist band' }] },
  { id: 'right_arm', label: 'Right arm', mapping: [{ type: 'spo2', basis: 'Sensor site: right index fingertip' }] },
  { id: 'left_leg', label: 'Left leg', mapping: [] },
  { id: 'right_leg', label: 'Right leg', mapping: [] },
];

export const DEMO_RULES: AlertRule[] = [
  { id: 'DEMO-EVT-001', version: 1, type: 'demo_event', category: 'clinical_demo', measurement_type: 'demo_marker', unit: 'count', condition: 'Any valid demo_marker event', params: {}, quality_policy: 'Only valid events evaluated; others create a data-quality event instead.', severity_label: 'DEMO · priority A', description: 'Injected demonstration alert to exercise the alert workflow.', status: 'demo_active', simulation_only: true, effective_from: '2026-01-01T00:00:00Z', author: 'astra-demo-config', reviewer: null, approval_evidence: null },
  { id: 'DEMO-RANGE-HR-001', version: 3, type: 'range_check', category: 'clinical_demo', measurement_type: 'heart_rate', unit: 'bpm', condition: 'value > upper', params: { upper: 137 }, quality_policy: 'Evaluated only for validity=valid AND quality=good. Questionable/poor quality is routed to DQ-QUAL-001, never to this rule.', severity_label: 'DEMO · priority B', description: 'ARBITRARY demonstration parameter. Not a clinical limit. Exists only to exercise the workflow.', status: 'demo_active', simulation_only: true, effective_from: '2026-01-01T00:00:00Z', author: 'astra-demo-config', reviewer: null, approval_evidence: null },
  { id: 'DQ-QUAL-001', version: 1, type: 'quality_event', category: 'data_quality', measurement_type: null, unit: null, condition: 'quality ∈ {questionable, poor} OR validity ∈ {questionable, invalid, sensor_fault, missing_value}', params: {}, quality_policy: 'Creates a visible data-quality event. Never converted into a clinical alert.', severity_label: 'Data quality', description: 'Signal quality / validity notice for operators.', status: 'demo_active', simulation_only: true, effective_from: '2026-01-01T00:00:00Z', author: 'astra-demo-config', reviewer: null, approval_evidence: null },
  { id: 'INT-001', version: 1, type: 'integrity_event', category: 'data_quality', measurement_type: null, unit: null, condition: 'Ingestion quarantine (conflict, unknown unit, schema, future timestamp) or outbox overflow', params: {}, quality_policy: 'n/a', severity_label: 'Data integrity', description: 'Telemetry integrity notice.', status: 'demo_active', simulation_only: true, effective_from: '2026-01-01T00:00:00Z', author: 'astra-demo-config', reviewer: null, approval_evidence: null },
  { id: 'LINK-001', version: 1, type: 'link_event', category: 'system', measurement_type: null, unit: null, condition: 'link state ∈ {disconnected, degraded}', params: {}, quality_policy: 'n/a', severity_label: 'System', description: 'Communication link state notice. Not a clinical condition.', status: 'demo_active', simulation_only: true, effective_from: '2026-01-01T00:00:00Z', author: 'astra-demo-config', reviewer: null, approval_evidence: null },
];

export const ESCALATION_PROCEDURE: { id: string; version: string } | null = null; // none approved

export const ROLE_LABEL: Record<Role, string> = {
  astronaut: 'Astronaut',
  flight_surgeon: 'Flight Surgeon',
  med_specialist: 'Medical Monitoring Specialist',
  mission_control: 'Mission Control Operator',
  sys_admin: 'System Administrator',
};

/** Server-side permission matrix (default deny). See docs/security/permissions.md */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  astronaut: ['profile.view_own', 'report.own', 'ops.view'],
  flight_surgeon: ['medical.view_assigned', 'monitoring.view_assigned', 'ops.view', 'note.clinical.create', 'alert.ack.clinical', 'alert.ack.data_quality', 'alert.assign', 'alert.resolve.clinical', 'alert.resolve.operational', 'rule.view', 'rule.draft', 'report.medical', 'sim.control', 'device.view'],
  med_specialist: ['monitoring.view_assigned', 'ops.view', 'note.operational.create', 'alert.ack.data_quality', 'alert.resolve.operational', 'rule.view', 'sim.control', 'device.view'],
  mission_control: ['roster.view', 'ops.view', 'alert.ack.system', 'sim.control', 'report.ops'],
  sys_admin: ['roster.view', 'ops.view', 'alert.ack.system', 'users.manage', 'rule.view', 'audit.view', 'sim.control', 'device.view'],
};
