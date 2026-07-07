---
title: 'Zero-downtime data migration with expand, migrate, and contract'
description: 'A migration pattern for changing schemas and moving data while keeping old and new application versions safe.'
pubDate: '2025-09-18'
---

# Zero-downtime data migration with expand, migrate, and contract

Zero-downtime migration is less about one clever script and more about compatibility. The database, old application version, and new application version must be able to coexist during the rollout.

The safest pattern is expand, migrate, and contract.

## Expand

In the expand phase, add new structures without breaking old code.

Examples:

- Add a nullable column.
- Add a new table.
- Add a new index concurrently where supported.
- Add a new event field while keeping the old field.
- Add application code that can read both old and new formats.

The key is backward compatibility. Old code should continue to run after the database change.

## Migrate

In the migrate phase, data is copied or transformed gradually.

Important details:

- Backfill in small batches.
- Track progress.
- Make the migration idempotent.
- Avoid long locks.
- Avoid large transactions.
- Validate row counts and checksums.
- Keep normal production traffic in mind.

For large tables, the migration job should be pauseable and resumable. A migration that can only run perfectly from start to finish is not production-friendly.

## Dual write and dual read

Sometimes the application must write both old and new formats during the transition. This can work, but it must be designed carefully.

Dual writes need:

- Clear ownership of conflict resolution.
- Idempotency.
- Monitoring for write mismatch.
- A repair path.
- A rollback plan.

Dual reads can reduce risk. The application may read from the new location first and fall back to the old location while migration is still running.

## Contract

The contract phase removes the old structure after confidence is high.

This should happen in a later release, not immediately after the new code is deployed. Waiting gives time to detect edge cases and roll back if needed.

Examples:

- Stop writing old columns.
- Remove fallback reads.
- Drop old indexes.
- Drop old columns or tables.
- Remove migration code.

The contract phase is where many teams get impatient. That impatience is how rollback becomes impossible.

## Validation

A migration is not complete until it is verified.

Good validation includes:

- Count comparison.
- Checksums by range.
- Sampled record comparison.
- Business-level reconciliation.
- Error dashboards.
- Alerts for mismatch drift.

Validation should run during and after the migration. It is easier to repair small drift early than to discover large drift after cleanup.

## Rollback mindset

Every phase should answer: what happens if this fails?

If the expand phase fails, old code should still work. If migration fails, it should stop safely and resume later. If the new read path fails, the system should be able to return to the old path until the contract phase removes it.

Zero-downtime migration is successful when users do not notice it and operators are not afraid to pause it.
