import { LOGIN_LOCKOUT_MS, LOGIN_MAX_ATTEMPTS, ROLE_PERMISSIONS, SESSION_IDLE_TIMEOUT_MS } from '../domain/config';
import { randomId } from '../domain/logic';
import type { Permission, Role, Session, User } from '../domain/types';
import { clock, db } from './store';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public detail?: unknown) {
    super(message);
  }
}

/* ---------------- Password hashing ----------------
 * Deviation: Argon2id is specified, but this build runs fully in-browser. PBKDF2-SHA-256
 * (WebCrypto, 120k iterations, per-user salt) is used instead. See docs/decisions/0001.
 */
const enc = new TextEncoder();
function hex(buf: ArrayBuffer) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120_000 }, key, 256);
  return hex(bits);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** DEVELOPMENT-ONLY demo accounts. Disabled outside demo mode. */
export const DEMO_PASSWORD = 'astra-demo';
const DEMO_USERS: { id: string; username: string; display_name: string; role: Role; assigned: string[]; self: string | null }[] = [
  { id: 'u-astro', username: 'astro.vega', display_name: 'Mara Vega', role: 'astronaut', assigned: [], self: 'AST-001' },
  { id: 'u-surg1', username: 'dr.okafor', display_name: 'Dr. Ada Okafor', role: 'flight_surgeon', assigned: ['AST-001', 'AST-002', 'AST-003', 'AST-004'], self: null },
  { id: 'u-surg2', username: 'dr.mbeki', display_name: 'Dr. Thabo Mbeki-Lund', role: 'flight_surgeon', assigned: ['AST-005', 'AST-006'], self: null },
  { id: 'u-spec', username: 'spec.lindqvist', display_name: 'Elin Lindqvist', role: 'med_specialist', assigned: ['AST-001', 'AST-002', 'AST-003', 'AST-004', 'AST-005', 'AST-006'], self: null },
  { id: 'u-ops', username: 'ops.tanaka', display_name: 'Ren Tanaka', role: 'mission_control', assigned: [], self: null },
  { id: 'u-admin', username: 'admin.reyes', display_name: 'Sofía Reyes', role: 'sys_admin', assigned: [], self: null },
];
export const DEMO_ACCOUNTS = DEMO_USERS.map((u) => ({ username: u.username, role: u.role, name: u.display_name }));

export async function initUsers() {
  for (const u of DEMO_USERS) {
    const salt = randomId();
    db.users.set(u.id, {
      id: u.id, username: u.username, display_name: u.display_name, role: u.role, extra_permissions: [],
      assigned_astronauts: u.assigned, self_astronaut_id: u.self, disabled: false, salt,
      password_hash: await hashPassword(DEMO_PASSWORD, salt), failed_attempts: 0, locked_until: 0,
    });
  }
}

/* ---------------- Audit ---------------- */
const recentReads = new Map<string, number>();
export function audit(userId: string | null, action: string, targetType: string, targetId: string | null, outcome: 'allowed' | 'denied' | 'error', context?: string, dedupeReads = false) {
  if (dedupeReads) {
    const k = `${userId}|${action}|${targetId}|${outcome}`;
    const last = recentReads.get(k);
    if (last && clock.now() - last < 60_000) return;
    recentReads.set(k, clock.now());
  }
  // Never put medical values, passwords, tokens or keys in audit context.
  db.audit.push({ id: randomId(), at: clock.iso(), user_id: userId, action, target_type: targetType, target_id: targetId, outcome, context });
}

/* ---------------- Rate limiting ---------------- */
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = clock.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait and retry.');
  arr.push(now);
  buckets.set(key, arr);
}

/* ---------------- Sessions ---------------- */
export async function login(username: string, password: string): Promise<{ sid: string; csrf: string }> {
  const user = [...db.users.values()].find((u) => u.username === username.trim().toLowerCase());
  const now = clock.now();
  if (user && user.locked_until > now) {
    audit(user.id, 'auth.login', 'user', user.id, 'denied', 'locked');
    throw new ApiError(429, 'locked', `Too many failed attempts. Try again in ${Math.ceil((user.locked_until - now) / 1000)} s.`);
  }
  const ok = user && !user.disabled && timingSafeEqual(await hashPassword(password, user.salt), user.password_hash);
  if (!ok || !user) {
    if (user) {
      user.failed_attempts++;
      if (user.failed_attempts >= LOGIN_MAX_ATTEMPTS) { user.locked_until = now + LOGIN_LOCKOUT_MS; user.failed_attempts = 0; }
    }
    audit(user?.id ?? null, 'auth.login', 'user', user?.id ?? null, 'denied', 'bad_credentials_or_disabled');
    throw new ApiError(401, 'invalid_credentials', 'Invalid username or password, or account disabled.');
  }
  user.failed_attempts = 0;
  // Session rotation: always issue a fresh opaque ID on login.
  const session: Session = { id: randomId() + randomId(), user_id: user.id, csrf: randomId(), created_at: now, last_seen: now };
  db.sessions.set(session.id, session);
  audit(user.id, 'auth.login', 'user', user.id, 'allowed');
  return { sid: session.id, csrf: session.csrf };
}

export function logout(sid: string) {
  const s = db.sessions.get(sid);
  if (s) { db.sessions.delete(sid); audit(s.user_id, 'auth.logout', 'user', s.user_id, 'allowed'); }
}

export function revokeUserSessions(userId: string) {
  for (const [id, s] of db.sessions) if (s.user_id === userId) db.sessions.delete(id);
}

export function resolveSession(sid: string | null, csrf?: string | null, mutation = false): { user: User; session: Session } {
  if (!sid) throw new ApiError(401, 'unauthenticated', 'Not signed in.');
  const s = db.sessions.get(sid);
  if (!s) throw new ApiError(401, 'unauthenticated', 'Session expired or revoked. Please sign in again.');
  const now = clock.now();
  if (now - s.last_seen > SESSION_IDLE_TIMEOUT_MS) { db.sessions.delete(sid); throw new ApiError(401, 'session_expired', 'Session expired due to inactivity.'); }
  const user = db.users.get(s.user_id);
  if (!user || user.disabled) { db.sessions.delete(sid); throw new ApiError(401, 'unauthenticated', 'Account disabled.'); }
  if (mutation && csrf !== s.csrf) { audit(user.id, 'csrf.check', 'session', null, 'denied'); throw new ApiError(403, 'csrf_failed', 'CSRF token missing or invalid.'); }
  s.last_seen = now;
  return { user, session: s };
}

/* ---------------- Authorization policy (default deny) ---------------- */
export function permissionsOf(user: User): Set<Permission> {
  return new Set([...ROLE_PERMISSIONS[user.role], ...user.extra_permissions]);
}
export function can(user: User, p: Permission) { return permissionsOf(user).has(p); }
export function requirePerm(user: User, p: Permission, target = 'capability') {
  if (!can(user, p)) { audit(user.id, `authz.${p}`, target, null, 'denied'); throw new ApiError(403, 'forbidden', 'You do not have permission for this action.'); }
}

export type AccessLevel = 'medical' | 'monitoring' | 'roster';
export function canAccessAstronaut(user: User, astronautId: string, level: AccessLevel): boolean {
  const astro = db.astronauts.find((a) => a.id === astronautId);
  if (!astro) return false;
  const p = permissionsOf(user);
  const isSelf = user.self_astronaut_id === astronautId && p.has('profile.view_own') && astro.shares_self_view;
  const assigned = user.assigned_astronauts.includes(astronautId);
  const medical = isSelf || (p.has('medical.view_assigned') && assigned);
  if (level === 'medical') return medical;
  const monitoring = medical || (p.has('monitoring.view_assigned') && assigned);
  if (level === 'monitoring') return monitoring;
  return monitoring || p.has('roster.view') || isSelf;
}

export function requireAstronaut(user: User, astronautId: string, level: AccessLevel) {
  if (!canAccessAstronaut(user, astronautId, level)) {
    audit(user.id, `access.${level}`, 'astronaut', astronautId, 'denied');
    // 404-style response avoids confirming record existence to unauthorized users.
    throw new ApiError(404, 'not_found', 'Record not found or not accessible.');
  }
}

export function visibleAstronauts(user: User, level: AccessLevel) {
  return db.astronauts.filter((a) => canAccessAstronaut(user, a.id, level));
}
