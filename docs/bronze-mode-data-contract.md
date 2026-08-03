# Bronze mode data contract — Phase 0/1

## Scope

This contract covers backward-compatible data handling only. It does not define
or enable bronze matches, repechage matches, or auxiliary bracket storage.

## Category field

`bronze_mode` is stored on a tournament category and accepts exactly:

- `DUAL_BRONZE`
- `SINGLE_BRONZE`
- `WKF_REPECHAGE`

For a legacy category where `bronze_mode` is absent, the read-time effective
value is `DUAL_BRONZE`. Resolving the effective value must not mutate the source
object or persist a backfill.

An explicitly supplied invalid value is a validation error. It must not be
silently converted to `DUAL_BRONZE`.

## Schema version

- Schema setting key: `bronze_mode_schema_version`
- Current target version: `1`
- Missing setting means version `0` (legacy/unapplied).

Version 1 means every persisted category has an explicit valid `bronze_mode`.
Setting the version is permitted only after a verified backup and a successful
explicit migration of a copy or an operator-approved production migration.

Application startup must not automatically backfill tournament JSON or advance
the schema version.

## Migration contract

Migration planning is pure and non-mutating. A plan:

1. deep-copies tournament data;
2. adds `bronze_mode: DUAL_BRONZE` only where the field is absent;
3. rejects explicit invalid values;
4. returns a report containing affected tournament/category identifiers;
5. does not write SQLite, localStorage, backups, or settings.

Applying a migration is a separate, explicit operation and is outside automatic
startup behavior. Before any apply operation, a backup must be created and read
back successfully. The schema version may be advanced only after all invariant
checks pass.

## Phase 1 invariants

For every legacy tournament, migration planning and read-time resolution must
preserve all values except the planned missing `bronze_mode` fields. In
particular:

- tournament and category IDs are unchanged;
- category order is unchanged;
- `bracket` and `bracket.matches` are byte-for-byte equivalent as JSON values;
- no `bracket.auxiliaryMatches` property is created;
- match IDs, `matchNumber`, and `matchCode` (`M1...Mn`) are unchanged;
- athletes, scores, winners, BYE state, round, position, and `nextMatchId` are unchanged;
- schedule and mat assignments are unchanged;
- `categoryResults` and medal tables are unchanged;
- category `format` is unchanged and `format: repechage` is not converted;
- no SINGLE_BRONZE or WKF_REPECHAGE behavior is activated;
- the source objects passed to resolver, validation, or migration planning are
  not mutated.

## Reserved future match codes

The following convention is recorded for later phases only and must not cause
matches to be generated in Phase 0/1:

- `B1`: single bronze match;
- `RA1`, `RA2`, ...: repechage branch A;
- `RB1`, `RB2`, ...: repechage branch B.

Existing `M1`, `M2`, ... codes must never be renumbered or modified.
