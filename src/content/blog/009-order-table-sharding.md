---
title: 'Designing sharding for an order table with millions of new rows per day'
description: 'How to choose a shard key, route queries, generate IDs, support operations, and migrate safely.'
pubDate: '2024-08-16'
---

# Designing sharding for an order table with millions of new rows per day

An order table that receives millions of rows per day will eventually hit limits in storage, index size, query latency, backup time, and operational safety. Sharding can help, but it also makes the system more complex. The design should start from access patterns, not from table size alone.

The first question is: how will the data be queried?

## Access patterns

Typical order access patterns include:

- Query by order ID.
- Query by user ID.
- Query by merchant or tenant.
- Query recent orders by time range.
- Query payment or fulfillment status.
- Export orders for operations.
- Reconcile orders with external systems.

No single shard key is perfect for every pattern. A good design optimizes the most important path and provides secondary mechanisms for the rest.

## Choosing a shard key

`user_id` is a common shard key when most queries are user-centric. It keeps one user's orders together and makes user order history efficient.

`order_id` can work if the ID embeds shard information. It is excellent for direct lookup, but it does not help user history unless there is a mapping table or secondary index.

Time-based sharding is attractive for archival and recent queries, but it can create hot shards if all new writes target the same partition.

For many order systems, I prefer an order ID that contains routing information, plus a user-order index for user history. That keeps direct lookup fast and makes common user queries manageable.

## Avoiding hot shards

A shard key must distribute writes. If a key is too correlated with time or one large tenant, the system can overload one shard while others are idle.

Mitigations include:

- Hashing the shard key.
- Adding virtual buckets.
- Splitting large tenants.
- Separating hot tenants from normal tenants.
- Using time buckets only inside a broader hash strategy.

The routing strategy should be stable enough to avoid moving old data frequently.

## ID generation

Order IDs should be globally unique and useful for routing. Options include:

- Snowflake-style IDs.
- Database sequences per shard with shard prefix.
- UUID or ULID.
- Dedicated ID service.

Snowflake-style IDs are popular because they are sortable by time and can include machine or shard information. The main operational concern is clock behavior.

## Cross-shard queries

Sharding makes cross-shard queries expensive. Product requirements should acknowledge this early.

If operations need global search, a separate search index or reporting store may be better than querying every shard. If finance needs reconciliation, a downstream analytics pipeline may be more appropriate than running heavy SQL on production shards.

The transactional database should serve transactional access patterns. Reporting and search often deserve their own storage model.

## Migration plan

Moving from a single order table to sharded storage should be incremental:

1. Add a routing layer in the application.
2. Dual-write new data if necessary.
3. Backfill historical data shard by shard.
4. Validate counts and checksums.
5. Switch reads gradually.
6. Keep rollback possible until confidence is high.

The migration must be observable. Every mismatch should have enough context to repair data safely.

## Final thought

Sharding is not a performance decoration. It is a long-term ownership decision. Once the data is split, every query, migration, backup, and incident response path must understand the split. The best sharding design is the one that matches real access patterns and keeps operational work predictable.
