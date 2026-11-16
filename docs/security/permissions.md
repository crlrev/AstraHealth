# Permission matrix (implemented in `ROLE_PERMISSIONS`, `src/domain/config.ts`)

Default deny. Object scope is checked by `canAccessAstronaut(user, id, level)` with three levels:
- **medical**: self with explicit shared self-view, OR `medical.view_assigned` and assigned;
- **monitoring**: medical, OR `monitoring.view_assigned` and assigned;
- **roster**: monitoring, OR `roster.view`, OR self.

| Permission | Astronaut | Flight Surgeon | Med. Specialist | Mission Control | Sys Admin |
|---|---|---|---|---|---|
| profile.view_own | ✓ | | | | |
| roster.view (names/IDs/missions only) | | | | ✓ | ✓ |
| medical.view_assigned | | ✓ | | | |
| monitoring.view_assigned | | ✓ | ✓ | | |
| ops.view | ✓ (limited) | ✓ | ✓ | ✓ | ✓ |
| note.clinical.create | | ✓ | | | |
| note.operational.create | | | ✓ | | |
| alert.ack.clinical / data_quality / system | | ✓ / ✓ / | / ✓ / | / / ✓ | / / ✓ |
| alert.assign | | ✓ | | | |
| alert.resolve.clinical / operational | | ✓ / ✓ | / ✓ | | |
| rule.view / rule.draft | | ✓ / ✓ | ✓ / | | ✓ / |
| clinical_rule_approve | never granted by role | | | | |
| report.medical / report.own / report.ops | / ✓ / | ✓ / / | | / / ✓ | |
| users.manage, audit.view | | | | | ✓ |
| sim.control (demo) | | ✓ | ✓ | ✓ | ✓ |
| device.view | | ✓ | ✓ | | ✓ |

**Notes**
- Administrators and Mission Control have no implicit medical access (tested).
- During testing, the roster permission was found to over-expose unassigned crew to flight surgeons and specialists, and it was removed from both roles.
- Astronauts can download only reports they generated for themselves. No report-sharing workflow exists.
- Break-glass access is out of scope.
