---
title: 'Redis persistence: RDB, AOF, and the tradeoff between speed and durability'
description: 'A practical comparison of Redis snapshotting, append-only files, rewrite behavior, fsync policies, and recovery expectations.'
pubDate: '2025-04-09'
---

# Redis persistence: RDB, AOF, and the tradeoff between speed and durability

Redis is an in-memory database, but it still needs a persistence story. The two classic mechanisms are RDB snapshots and AOF, the append-only file.

They solve different problems and have different failure tradeoffs.

## RDB snapshots

RDB persistence saves a point-in-time snapshot of the dataset to disk. Redis typically creates the snapshot in a child process, so the main process can continue serving requests.

Benefits:

- Compact file format.
- Fast restart from a snapshot.
- Good for backups.
- Lower write overhead than AOF.

Costs:

- Data written after the last snapshot can be lost after a crash.
- Forking can be expensive for large datasets.
- Copy-on-write memory overhead can be significant during snapshotting.

RDB works well when losing a small window of recent data is acceptable or when Redis is mainly a cache.

## AOF

AOF logs write commands. On restart, Redis replays the file to rebuild the dataset.

The durability depends on the fsync policy:

- `always`: safest but slowest.
- `everysec`: common balance; up to about one second of data loss.
- `no`: fastest, but durability depends on the operating system flush behavior.

AOF gives better durability than periodic snapshots, but it creates more disk I/O.

## AOF rewrite

Over time, AOF grows because it records operations. Redis can rewrite it into a smaller equivalent file.

For example, many increments or updates to the same key can be represented by the final value. Rewrite reduces file size and restart time.

Like RDB, rewrite uses a child process and can create copy-on-write memory pressure. Large Redis instances should be monitored during rewrite.

## Mixed persistence

Modern Redis can use an AOF file that begins with an RDB preamble, followed by incremental AOF commands. This combines faster loading with better recent durability.

The right configuration depends on the role of Redis:

- Cache: RDB or even no persistence may be acceptable.
- Session store: AOF `everysec` may be reasonable.
- Critical data store: be careful; Redis persistence alone may not be enough.

## Recovery expectations

Persistence should be tested by actually restarting from files. I want to know:

- How long does recovery take?
- How much data can be lost?
- Does the instance have enough memory during fork?
- Are persistence files backed up?
- Are corrupt files detected and handled?

Redis can be extremely reliable when configured for the workload, but the persistence settings must match the business expectation. A cache and a ledger should not use the same durability assumptions.
