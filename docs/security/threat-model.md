# Threat model & security limitations

## Implemented in the prototype
- Opaque session IDs held in memory (not localStorage), rotated on login, 30-minute idle expiry, revoked on logout or account disablement.
- CSRF token required on every mutation.
- PBKDF2-SHA-256 password hashing with per-user salt, compared in constant time. 5 failed logins trigger a 60 s lockout.
- Default-deny permission matrix and object-level scope checks. IDOR attempts get 404 responses.
- Subscriptions check origin, authenticate, and re-authorize on each delivery.
- Rate limits on login, search (60/min) and report generation (10/min).
- CSV formula-injection neutralization (`= + - @ \t \r` prefixes). Report filenames are sanitized. Downloads are re-authorized.
- No mass assignment: note creation maps fields explicitly. React output encoding protects against XSS, and no `dangerouslySetInnerHTML` is used.
- Audit log for logins, denials, sensitive reads (deduplicated per minute), writes, and report generation/download. It never contains medical values or secrets.

## Not a security boundary (critical)
The whole "backend" runs in the user's browser. A malicious user can read the in-memory store or bypass checks with dev tools. Every control above shows the intended **policy**, but none of them **enforces** anything against an attacker in this build.

## Required before any operational use (BLOCKED / not implemented)
- A server-side API with TLS, HttpOnly/Secure/SameSite cookies, Argon2id hashing, and explicit CORS and security headers (CSP, HSTS).
- PostgreSQL with migrations, encrypted volumes, application-level AES-GCM field encryption, and KMS/HSM key management with rotation.
- Tamper-evident external audit storage, retention policies, and encrypted backups.
- Gateway authentication (mTLS or signed batches) for the ingest endpoint.
- Independent penetration test, hazard analysis, clinical validation, and regulatory gap assessment.

No compliance with HIPAA, GDPR, NASA/ESA, medical-device, or aerospace standards is claimed.
