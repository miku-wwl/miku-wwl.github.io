---
title: 'Improving API performance without guessing'
description: 'A structured approach to API latency: measure first, set budgets, optimize database access, reduce payloads, and protect dependencies.'
pubDate: '2026-01-20'
---

# Improving API performance without guessing

API performance work should begin with a latency budget. Without a budget, every optimization feels important and none of them are accountable.

For example, a 300 ms endpoint budget might be split into authentication, application logic, database calls, downstream calls, serialization, and network time. Once the budget is visible, the slow part has nowhere to hide.

## Measure the path

I start with tracing or structured timing:

- Total request latency.
- Database query time.
- Downstream HTTP or RPC time.
- Serialization time.
- Cache hit rate.
- Queue wait time.
- Thread pool saturation.

Average latency is not enough. Tail latency matters because users and upstream services feel the slow requests.

## Fix database access

Database work is often the largest part of backend latency.

Common fixes include:

- Add or adjust indexes based on execution plans.
- Avoid N+1 queries.
- Limit selected columns.
- Use keyset pagination for deep pages.
- Split list and detail endpoints.
- Cache stable reference data.
- Keep transactions short.

The correct fix depends on the plan and data distribution. Adding indexes blindly can slow writes and still miss the query pattern.

## Reduce payload cost

Large payloads hurt in multiple places: database, application memory, serialization, network, and client parsing.

Useful patterns:

- Return only fields the client needs.
- Use pagination.
- Compress large responses when appropriate.
- Avoid embedding large nested collections in list endpoints.
- Prefer stable response contracts over ad-hoc expansion.

The fastest response is often the one that does less work.

## Cache deliberately

Caching can be powerful, but it should have a clear purpose:

- Reduce database load.
- Hide downstream latency.
- Protect a hot read path.
- Store expensive computed results.

Every cache needs invalidation rules, TTL, metrics, and a failure behavior. A cache that silently serves stale critical data can be worse than no cache.

## Protect downstream dependencies

An API can be slow because another service is slow. Defensive patterns include:

- Timeouts.
- Bounded retries with jitter.
- Circuit breakers.
- Bulkheads.
- Fallbacks for non-critical data.
- Request hedging only when the cost is understood.

Retries deserve special care. Retrying a slow dependency under load can turn a partial failure into a larger outage.

## Optimize the system, not one method

After a fix, I want to see the effect in production-like data:

- Did p95 and p99 improve?
- Did error rate change?
- Did database load move somewhere else?
- Did cache hit rate improve?
- Did the user-visible flow get faster?

API performance is a loop: measure, change, verify, and keep the evidence. Guessing feels faster at the start, but measurement is what gets the system reliably faster.
