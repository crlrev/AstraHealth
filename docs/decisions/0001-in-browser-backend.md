# ADR 0001 — In-browser stand-in backend instead of FastAPI/PostgreSQL

**Status:** Accepted (forced by environment). **Date:** 2026-11-16

## Context
The workspace is a Vite single-file template. The build output that gets served is just `dist/index.html`. There is no Python runtime, PostgreSQL, Docker service, or server process behind it, and `package.json`/`vite.config.ts` must not be edited.

## Decision
Implement the backend contracts as TypeScript modules that run in the browser (`src/backend`):
- an in-memory store with indexes that stand in for PostgreSQL constraints: unique `event_id`, unique `(stream_id, sequence_number)`, and series sorted by `measured_at`;
- sessions with opaque IDs held in memory (never in localStorage), CSRF tokens checked on every mutation, 30-minute idle expiry, and rotation on login;
- PBKDF2-SHA-256 (WebCrypto, 120k iterations, per-user salt) **instead of Argon2id**, because no Argon2 implementation is available without WASM in this template;
- the permission matrix and object-level checks on every API function.

## Consequences
- **Not a security boundary.** Any user who controls the browser can bypass these checks. A real deployment must move them server-side.
- **No persistence.** The store is reseeded deterministically on every load. Backup/restore, Alembic migrations, encryption at rest, and field-level AES-GCM encryption are BLOCKED.
- **Portability.** The domain and API layers are framework-free, so they can be ported to FastAPI/Pydantic.

# ADR 0002 — HashRouter
Because the build is served as a static file, `HashRouter` is used so deep links survive a reload without server rewrites. Routes keep the specified paths, e.g. `#/crew/AST-001/anatomy`.

# ADR 0003 — No TanStack Query / Zod
The API is synchronous and in-process, so a `useSyncExternalStore`-based hook (`useApi`) with batched invalidation replaces TanStack Query. A hand-written envelope validator (`validateEnvelope`) replaces Zod at the ingestion boundary. Both should be revisited once there is a real network boundary.

# ADR 0004 — 2D SVG body map
Discrete, non-overlapping paths with keyboard support. Muscular and skeletal views are decorative, non-interactive layers. The region→measurement mapping lives only in `ANATOMY_REGIONS` (`src/domain/config.ts`).
