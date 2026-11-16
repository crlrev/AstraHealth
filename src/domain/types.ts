// ASTRAHEALTH domain types. Demonstration prototype — NOT FOR CLINICAL USE.

export type Role =
  | 'astronaut'
  | 'flight_surgeon'
  | 'med_specialist'
  | 'mission_control'
  | 'sys_admin';

export type Permission =
  | 'profile.view_own'
  | 'roster.view'
  | 'medical.view_assigned'
  | 'monitoring.view_assigned'
  | 'ops.view'
  | 'note.clinical.create'
  | 'note.operational.create'
  | 'alert.ack.clinical'
  | 'alert.ack.data_quality'
  | 'alert.ack.system'
  | 'alert.assign'
  | 'alert.resolve.clinical'
  | 'alert.resolve.operational'
  | 'users.manage'
  | 'rule.view'
  | 'rule.draft'
  | 'clinical_rule_approve'
  | 'report.medical'
  | 'report.own'
  | 'report.ops'
  | 'sim.control'
  | 'audit.view'
  | 'device.view';

export type DataOrigin = 'simulated' | 'device' | 'manual' | 'imported' | 'derived';
export type AcquisitionMode = 'continuous' | 'periodic' | 'event_based' | 'manual' | 'derived' | 'imported';
export type Validity = 'valid' | 'questionable' | 'invalid' | 'missing_value' | 'sensor_fault' | 'unknown';
export type Quality = 'good' | 'questionable' | 'poor' | 'unknown';
export type Freshness = 'fresh' | 'delayed' | 'stale' | 'unavailable' | 'unconfigured';
export type LinkState = 'connected' | 'degraded' | 'delayed' | 'disconnected' | 'unknown';
export type MissionPhase = 'pre_flight' | 'in_flight' | 'post_flight';

export type MeasurementType =
  | 'heart_rate'
  | 'hrv_rmssd'
  | 'respiratory_rate'
  | 'spo2'
  | 'skin_temperature'
  | 'bp_systolic'
  | 'bp_diastolic'
  | 'body_mass'
  | 'demo_marker';

/** Wire-level envelope produced by the (simulated) edge gateway. schema_version 1.0 */
export interface TelemetryEnvelope {
  event_id: string;
  schema_version: string;
  astronaut_id: string;
  mission_id: string | null;
  sensor_id: string;
  stream_id: string;
  sequence_number: number | null;
  measurement_type: string;
  acquisition_mode: AcquisitionMode;
  raw_value: number | null;
  raw_unit: string | null;
  measured_at: string; // ISO UTC
  received_at_edge: string | null;
  timestamp_source: 'sensor_clock' | 'edge_clock' | 'manual_entry' | 'unknown';
  clock_uncertainty_ms: number | null;
  data_origin: DataOrigin;
  simulation_scenario_id: string | null;
  simulator_version: string | null;
  seed: number | null;
  validity_state: Validity;
  quality_state: Quality;
  measurement_method: string;
  device_class: string;
  measurement_context: Record<string, string>;
  mission_phase: MissionPhase;
}

export interface StoredMeasurement extends TelemetryEnvelope {
  received_at_ground: string;
  ingest_seq: number; // global monotonic cursor (resume position)
  backfilled: boolean;
  out_of_order: boolean;
  payload_hash: string;
  normalized_value: number | null;
  normalized_unit: string | null;
  conversion_version: string | null;
}

export type IntegrityKind =
  | 'schema_invalid'
  | 'unsupported_schema'
  | 'unknown_measurement_type'
  | 'unknown_unit'
  | 'future_timestamp'
  | 'provenance_invalid'
  | 'duplicate_ignored'
  | 'conflict_quarantined'
  | 'out_of_order'
  | 'sequence_gap'
  | 'outbox_full'
  | 'outbox_malformed_record'
  | 'backend_unavailable';

export interface IntegrityEvent {
  id: string;
  kind: IntegrityKind;
  at: string;
  stream_id: string | null;
  astronaut_id: string | null;
  event_id: string | null;
  detail: string;
  quarantined_payload?: unknown;
}

export interface LinkStatus {
  state: LinkState;
  last_contact: string | null;
  observed_latency_ms: number | null;
  queued: number;
  outbox_capacity: number;
  last_acked_cursor: number;
  last_error: string | null;
  generator_halted: boolean;
}

export interface FreshnessPolicy {
  measurement_type: MeasurementType;
  acquisition_mode: AcquisitionMode;
  expected_interval_s: number | null;
  fresh_until_s: number;
  delayed_until_s: number;
  source: string;
  approval: 'demo_unapproved' | 'approved';
}

export interface MeasurementDef {
  type: MeasurementType;
  label: string;
  short: string;
  unit: string; // canonical raw unit accepted
  allowedUnits: string[];
  acquisition_mode: AcquisitionMode;
  method: string;
  device_class: string;
  family: 'cardiovascular' | 'respiratory' | 'body' | 'demo';
  decimals: number;
}

export type RuleStatus = 'draft' | 'demo_active' | 'pending_external_review' | 'clinically_approved' | 'retired';
export type AlertCategory = 'clinical_demo' | 'data_quality' | 'system';

export interface AlertRule {
  id: string;
  version: number;
  type: 'range_check' | 'quality_event' | 'freshness_event' | 'link_event' | 'demo_event' | 'integrity_event';
  category: AlertCategory;
  measurement_type: MeasurementType | null;
  unit: string | null;
  condition: string;
  params: Record<string, number | string>;
  quality_policy: string;
  severity_label: string;
  description: string;
  status: RuleStatus;
  simulation_only: boolean;
  effective_from: string;
  author: string;
  reviewer: string | null;
  approval_evidence: string | null;
}

export type AlertStatus = 'active_unacknowledged' | 'acknowledged' | 'assigned' | 'resolved' | 'reopened';

export interface AlertEvent {
  at: string;
  by: string; // user id or 'system'
  action: 'created' | 'acknowledged' | 'assigned' | 'resolved' | 'reopened' | 'occurrence';
  note?: string;
}

export interface Alert {
  id: string;
  fingerprint: string;
  rule_id: string;
  rule_version: number;
  category: AlertCategory;
  astronaut_id: string | null;
  mission_id: string | null;
  stream_id: string | null;
  source_event_id: string | null;
  severity_label: string;
  title: string;
  detail: string;
  status: AlertStatus;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  occurrences: number;
  version: number;
  history: AlertEvent[];
  simulation_only: boolean;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  extra_permissions: Permission[];
  assigned_astronauts: string[]; // scope
  self_astronaut_id: string | null;
  disabled: boolean;
  salt: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: number;
}

export interface Session {
  id: string;
  user_id: string;
  csrf: string;
  created_at: number;
  last_seen: number;
}

export interface Astronaut {
  id: string;
  display_name: string;
  callsign: string;
  mission_id: string;
  crew_role: string;
  nationality_demo: string;
  assigned_surgeon: string;
  initials: string;
  hue: number;
  shares_self_view: boolean;
}

export interface Mission {
  id: string;
  name: string;
  vehicle: string;
  phase: MissionPhase;
  launch_at: string;
  planned_days: number;
}

export interface SensorDevice {
  id: string;
  device_class: string;
  model: string;
  firmware: string;
  calibration_ref: string;
  astronaut_id: string;
  body_site: string;
  measurement_types: MeasurementType[];
}

export interface NoteRevision {
  version: number;
  body: string;
  edited_at: string;
  edited_by: string;
  reason: string;
}

export interface Note {
  id: string;
  kind: 'clinical' | 'operational';
  astronaut_id: string;
  mission_id: string;
  author_id: string;
  created_at: string;
  title: string;
  body: string;
  version: number;
  shared_with_astronaut: boolean;
  revisions: NoteRevision[];
}

export interface SleepRecord {
  id: string;
  astronaut_id: string;
  start: string;
  end: string;
  duration_min: number;
  status: 'estimated';
  method: string;
  device_class: string;
  data_origin: DataOrigin;
  simulation_scenario_id: string;
}

export interface ExerciseRecord {
  id: string;
  astronaut_id: string;
  start: string;
  duration_min: number;
  modality: 'treadmill' | 'cycle_ergometer' | 'resistive_device';
  workload_value: number;
  workload_unit: string;
  status: 'measured';
  method: string;
  data_origin: DataOrigin;
  simulation_scenario_id: string;
}

export interface RadiationMeasurement {
  id: string;
  astronaut_id: string | null; // null for area monitors
  mission_id: string;
  quantity: 'absorbed_dose' | 'dose_equivalent';
  unit: 'mGy' | 'mSv';
  value: number;
  detector_class: string;
  detector_id: string;
  scope: 'personal' | 'area';
  interval_start: string;
  interval_end: string;
  status: 'measured' | 'estimated';
  location: string | null;
  data_origin: DataOrigin;
  simulation_scenario_id: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: 'allowed' | 'denied' | 'error';
  context?: string;
}

export interface ReportRecord {
  id: string;
  type: ReportType;
  format: 'pdf' | 'csv';
  astronaut_id: string | null;
  mission_id: string;
  interval_start: string;
  interval_end: string;
  generated_at: string;
  generated_by: string;
  filename: string;
  row_count: number;
  content: string | Uint8Array;
}

export type ReportType =
  | 'daily_summary'
  | 'weekly_summary'
  | 'mission_overview'
  | 'measurement_history'
  | 'alert_history'
  | 'sleep_exercise'
  | 'radiation_summary';

export type MonitoringState =
  | 'unavailable'
  | 'configured_rule_match'
  | 'degraded'
  | 'stale'
  | 'delayed'
  | 'rules_not_configured'
  | 'not_evaluated'
  | 'data_available';
