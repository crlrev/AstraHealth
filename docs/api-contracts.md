# API contracts (logical `/api/v1`)

Each function in `src/backend/api.ts` and `src/backend/reports.ts` is the in-process equivalent of an endpoint. Errors are `ApiError{status, code, message}`:
- 401 unauthenticated/expired
- 403 forbidden/CSRF
- 404 not found or not accessible (used for IDOR so record existence isn't revealed)
- 409 version conflict
- 400 validation
- 423 blocked
- 429 rate limited

| Endpoint | Function | Authorization |
|---|---|---|
| POST /auth/login | `auth.login` | rate limit: 5 failures → 60 s lockout |
| POST /auth/logout | `auth.logout` | session |
| GET /auth/me | `me` | session |
| GET /missions | `listMissions` | roster.view = all, otherwise missions of visible crew |
| GET /crew | `listCrew(q, mission, page, pageSize)` | roster or assigned/self scope; sorted by id; paginated |
| GET /crew/{id} | `getAstronaut` | roster scope; devices need device.view + monitoring |
| GET /crew/{id}/summary | `crewSummary` | monitoring scope |
| GET /crew/{id}/measurements/{type}/history | `history(win, phase)` | monitoring scope; ≤600 display points |
| GET /crew/{id}/anatomy-map | `anatomyMap` | monitoring scope |
| GET /crew/{id}/baseline | `baselineCompare` | monitoring scope; returns not-comparable reasons |
| POST /telemetry/ingest-batches | `ingestBatch` | gateway (no user session; trusted in-process) |
| GET /telemetry/streams/{id}/status | `streamStatus` | monitoring scope of stream owner |
| GET /operations/link-status | `linkStatus` | ops.view |
| WS /ws/telemetry | `bus.subscribe` | origin allowlist + session + per-astronaut monitoring; resume cursor |
| GET /alerts | `listAlerts` | clinical_demo needs medical scope; data_quality needs monitoring; system needs ops |
| POST /alerts/{id}/acknowledge | `ackAlert(id, version)` | CSRF + category ack permission + version |
| POST /alerts/{id}/assign | `assignAlert` | CSRF + alert.assign; assignee must be able to see the alert |
| POST /alerts/{id}/resolve | `resolveAlert(id, note, version)` | CSRF + resolve permission; note required |
| GET /rules | `listRules` | rule.view |
| POST /rules/{id}/approve | `approveRule` | clinical_rule_approve + evidence → always 423 in prototype |
| GET /records | `listNotes` | clinical: medical scope (astronaut sees shared only); operational: monitoring |
| POST /clinical-notes | `createNote` | CSRF + note.*.create + scope; explicit field mapping |
| PATCH /notes/{id} | `editNote(id, body, reason, expectedVersion)` | author only; 409 on stale version |
| GET /crew/{id}/sleep-records, exercise-records | `wellness` | medical scope |
| GET /radiation/measurements | `radiation(astronautId)` | monitoring scope |
| GET/POST /reports, GET /reports/{id}/download | `listReports`, `createReport`, `downloadReport` | `canReport` at generation and download; 10/min rate limit |
| GET /search | `search(q, page)` | scoped; names, IDs, missions and sensor IDs only; 60/min |
| GET /admin/users, POST disable | `listUsers`, `setUserDisabled` | users.manage; disabling revokes sessions |
| GET /audit | `listAudit` | audit.view |
| GET /health/live, /health/ready | Settings → System status | — |
| POST /sim/* | `simSetLink`, `simInject`, `simRestart`, `simBackend`, `simGenerator` | CSRF + sim.control |
