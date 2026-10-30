# Data model

The authoritative schema is `server/src/db.ts` (PostgreSQL). The TypeScript types are in `shared/src/types.ts`.

```
clients ─┬─ buildings (city, site) ─┬─ floors ── locations
         │                          └─ assets ── inspections ── photos
         ├─ users (client_admin scoped to one client)
         └─ notifications
team_members (inspector picker)   templates (versioned checklists)   audit_log   import_batches   sync_ops
```

| Table | Key fields | Notes |
|---|---|---|
| clients | name, code | e.g. JLL |
| buildings | client_id, city, name, code | One row per inventory site (NKP, Platina 3 …) |
| floors / locations | building_id, name, sort_order | Created on site; soft-deleted |
| assets | equipment_type, asset_tag, serial_number, manufacturer, model, candidate_makes, install_date (+estimated), status, status_reason, data_flags, open_defects, last_inspection_*, next_due_date, import_key, import_source | `client_id` and `building_id` are denormalised for scoping and fast roll-ups |
| templates | id, version, definition (JSONB) | Inspections pin `template_version` |
| inspections | asset_id, template_id/version, kind (routine / retest), retest_of, status (draft → submitted → finalized, or returned), doc (JSONB: header, checks, functionalTest, result, signatures, events), rev | `events` is the field-level change log captured on the device, including offline edits |
| photos | inspection_id, check_no, mime, data | Compressed to ≤1600 px on the device |
| users | email, role (admin / inspector / reviewer / client_admin), client_id, team_member_id | |
| team_members | name, designation, active | Delete is a soft delete, so past inspections keep names |
| audit_log | who, role, action, entity, changes, device_id, offline, client_at | Every server-side change and login |
| notifications | kind (overdue, due_soon, out_of_service, retest), dedupe_key | Daily reminder run |
| sync_ops | op_id | Makes offline replays idempotent |

**Change tracking.** Every table carries `seq` from one global sequence. Devices pull with `GET /api/sync/pull?since=<seq>` and push their queued operations with `POST /api/sync/push`.

**Lock rules (enforced by the server).**
- Inspectors edit only their own draft or returned inspections.
- Submitted inspections are locked until a reviewer finalises or returns them.
- Finalised inspections are immutable.
- Client admins are read-only and see only their own client's data.
