# Data model

The authoritative schema is `server/src/db.ts` (PostgreSQL). The TypeScript types are in `shared/src/types.ts`.

```
clients ─┬─ buildings (city, site) ─┬─ floors ── locations
         │                          └─ assets ── inspections ── photos
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
| team_members | name, designation, active | The people in the Technician picker. Delete is a soft delete, so past inspections keep names |
| audit_log | who, role, action, entity, changes, device_id, offline, client_at | Every server-side change and login |
| notifications | kind (overdue, due_soon, out_of_service, retest), dedupe_key | Daily reminder run |
| sync_ops | op_id | Makes offline replays idempotent |

**Change tracking.** Every table carries `seq` from one global sequence. Devices pull with `GET /api/sync/pull?since=<seq>` in pages of 60 changes (each response stays far below the host's 4.5 MB limit) and push their queued operations with `POST /api/sync/push`.

**Access and locking.** One shared access code opens the app (see ASSUMPTIONS). The server enforces the workflow: submitted inspections are locked until finalised or returned, and finalised inspections are immutable.
