---
title: 'Keeping Redis and MySQL reasonably consistent'
description: 'How to think about cache-aside, invalidation, delayed delete, binlog-driven refresh, idempotency, and the limits of cache consistency.'
pubDate: '2025-05-14'
---

# Keeping Redis and MySQL reasonably consistent

Redis is usually a cache. MySQL is usually the source of truth. That sentence sounds obvious, but many consistency bugs happen when a system forgets it.

The goal is not perfect distributed consistency. The goal is to choose a consistency model that matches the business requirement and to make stale data bounded, observable, and recoverable.

## Cache-aside as the default

The most common pattern is cache-aside:

1. Read from Redis.
2. If the key is missing, read from MySQL.
3. Write the value back to Redis with a TTL.
4. On update, write MySQL and invalidate Redis.

This model is simple and works well for many services. The cache is a performance layer, not the owner of the data.

The update order matters. I generally prefer updating MySQL first and then deleting the cache key. Updating the cache directly after a database write can create stale cache if concurrent writes complete out of order.

## Why stale data still happens

Even with the normal pattern, stale data can happen:

- A read misses cache and reads old data before a concurrent update commits.
- The read writes old data into Redis after the update deletes the key.
- Cache deletion fails after the database update succeeds.
- Replication lag makes a read replica return old data.
- Multiple services update the same entity with different cache rules.

This is why cache consistency should be designed as eventual consistency unless the domain truly requires stronger guarantees.

## Delayed double delete

Delayed double delete is a common mitigation:

1. Delete cache.
2. Update database.
3. Wait briefly.
4. Delete cache again.

The second delete tries to remove stale data that may have been written by a concurrent read during the update window.

This is not a formal guarantee. The delay is workload dependent, and long request tails can still break the assumption. It can be useful, but I would not present it as a perfect solution.

## Binlog-driven invalidation

For larger systems, database change streams can drive cache invalidation or refresh. A service reads MySQL binlog events, identifies changed rows, and deletes or updates corresponding Redis keys.

The benefit is centralization. Instead of every writer remembering every cache key, the change stream becomes a consistent invalidation path.

The cost is operational complexity:

- Event ordering must be understood.
- Consumers must be idempotent.
- Lag must be monitored.
- Schema changes can break event parsing.
- Rebuild and replay procedures must exist.

This approach is strong when many services write the same data or when cache invalidation rules are too scattered.

## TTL is a safety net

Every cache key that can become stale should have a TTL. TTL does not solve consistency, but it limits how long a bug can survive.

TTL design should consider:

- How stale the business can tolerate the value.
- Whether hot keys can expire at the same time.
- Whether random jitter should be added.
- Whether rebuild cost is acceptable.

For hot keys, I often prefer active refresh or background warming instead of allowing all clients to rebuild the value at once.

## Idempotency and versioning

When updates can arrive out of order, versioning helps. A cache value can include a version, updated timestamp, or database sequence. Writers should not overwrite a newer value with an older one.

For event-driven cache updates, idempotency is mandatory. The same event may be delivered more than once. A replay should not corrupt the cache.

## Practical recommendation

My default strategy is:

- Use MySQL as the source of truth.
- Use cache-aside for normal read paths.
- Invalidate cache after successful database writes.
- Add TTL and jitter.
- Make deletion failures visible.
- Use binlog-driven invalidation when multiple writers make local invalidation unsafe.
- Use version checks for event-driven updates.

The important mindset is to define the acceptable consistency window. Once the window is explicit, engineering decisions become easier: choose the cheapest design that stays inside it.
