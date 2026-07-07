---
title: 'Rate limiting strategies: fixed window, sliding window, token bucket, and leaky bucket'
description: 'A concise comparison of common rate limiting algorithms, their tradeoffs, and the production details that matter.'
pubDate: '2026-03-12'
---

# Rate limiting strategies: fixed window, sliding window, token bucket, and leaky bucket

Rate limiting is a reliability feature before it is a security feature. It protects downstream services, keeps noisy clients from consuming shared capacity, and gives the platform a predictable way to fail when traffic exceeds the budget.

The algorithm matters because different workloads need different behavior. Login attempts, public APIs, payment callbacks, and batch imports do not have the same tolerance for bursts.

## Fixed window

Fixed window counters are the simplest option. Count requests for a key during a time window, reset the count when the next window begins, and reject traffic after the limit is reached.

The benefit is operational simplicity. It is easy to implement with Redis `INCR` and `EXPIRE`, and it is easy to explain.

The weakness is the boundary burst. A client can send requests at the end of one window and immediately send more at the beginning of the next window. The average rate might be acceptable, but the instantaneous burst can still hurt the service.

Fixed window is fine for coarse protection, admin tools, or limits where exact smoothness is not important.

## Sliding log

Sliding log keeps timestamps of recent requests and removes entries outside the rolling window. It is accurate because every request is represented.

The tradeoff is memory and write amplification. A hot client can create many timestamp entries. In Redis, this is usually implemented with a sorted set, where the timestamp is both score and value.

Sliding log is useful for strict controls such as password reset attempts or sensitive account actions. I would avoid it for very high-throughput API traffic unless the limit cardinality is small.

## Sliding window counter

Sliding window counter approximates a rolling window by combining the current window and the previous window with a weight.

For example, if the current minute is 25 percent complete, the effective count can be:

```text
effective = currentCount + previousCount * 0.75
```

This is less precise than a sliding log, but it is much cheaper. It also avoids the worst fixed-window boundary burst.

This is a strong default for API gateways and service-level limits.

## Token bucket

Token bucket refills tokens at a fixed rate up to a maximum capacity. A request consumes one or more tokens. If no token is available, the request is rejected or delayed.

The important property is controlled burstiness. The refill rate defines the long-term average, while bucket capacity defines how much burst traffic is allowed.

Token bucket works well for public APIs and workloads where short bursts are normal. It protects the service without making every client behave like a perfectly smooth stream.

## Leaky bucket

Leaky bucket turns incoming traffic into a steady output rate. Requests enter a queue and leave at a fixed speed. If the queue is full, new requests are rejected.

This is useful when the downstream system needs smooth traffic more than burst flexibility. The cost is latency: accepted requests can wait in the bucket.

I normally use leaky bucket for background jobs or gateway-to-downstream shaping, not for user-facing APIs where queueing can create poor tail latency.

## Production details

The algorithm is only half of the implementation. A production limiter also needs:

- A clear key design: user, IP, API token, tenant, endpoint, or a combination.
- A response contract: HTTP `429`, retry headers, and useful error messages.
- Observability: allowed, rejected, delayed, and bypassed counts.
- Safe defaults: fail open or fail closed should be a deliberate choice.
- Distributed consistency: Redis, gateway-local limits, or layered limits.

My usual preference is layered limiting: a cheap local or gateway limit for immediate protection, plus a centralized Redis-backed limit for cross-instance fairness. That avoids making one store responsible for every small decision while still keeping tenant-level control accurate enough.
