---
title: 'Troubleshooting a sudden CPU spike in a backend service'
description: 'A production-oriented checklist for CPU spikes, slow services, Java thread dumps, GC pressure, locks, and hot code paths.'
pubDate: '2025-08-22'
---

# Troubleshooting a sudden CPU spike in a backend service

A CPU spike is easy to see and hard to interpret. High CPU can mean healthy throughput, a runaway loop, lock contention, expensive garbage collection, bad regex, excessive logging, or a downstream timeout causing retry storms.

The goal is not to guess. The goal is to quickly separate "the service is busy doing useful work" from "the service is burning CPU because something is wrong".

## Start with scope

I first check whether the spike is isolated or systemic:

- One pod or every pod?
- One node or multiple nodes?
- One version or multiple versions?
- One endpoint or all endpoints?
- A traffic increase or no traffic change?

If only one instance is affected, I suspect a hot key, uneven load balancing, a stuck request, or an instance-level issue. If every instance is affected, I look for a deployment, dependency change, traffic pattern, or shared infrastructure event.

## Correlate CPU with business traffic

CPU without context is noisy. I compare it with:

- Request rate.
- Error rate.
- Latency percentiles.
- Queue depth or consumer lag.
- Database latency.
- Retry count.
- GC metrics.

High CPU with higher throughput can be normal. High CPU with flat throughput and rising latency is more suspicious.

## Inspect hot threads

For a Java service, a practical sequence is:

1. Use `top` or container metrics to find the process.
2. Use `top -H` to identify hot threads.
3. Convert the thread id to hexadecimal.
4. Match it in `jstack` output.

This often reveals the shape of the problem: JSON serialization, regex matching, compression, logging, encryption, a busy loop, or a framework thread doing unexpected work.

Thread dumps should be taken more than once. A single dump is a photograph. Multiple dumps show whether the same stack remains hot.

## Check GC behavior

CPU can be consumed by garbage collection. Signs include:

- High allocation rate.
- Frequent young GC.
- Long old GC pauses.
- Rising heap after each collection.
- Many temporary objects from serialization or collection transforms.

If GC is the issue, increasing CPU will not fix the root cause. The fix may be reducing allocation, reusing buffers, changing batch sizes, fixing a memory leak, or tuning heap settings after understanding the allocation profile.

## Look for retry storms

Retry storms are common during partial failures. A downstream service becomes slow, requests time out, clients retry, and CPU rises because the service is doing repeated work that has little chance of succeeding.

Signals include:

- Timeout errors.
- Increased outbound calls.
- More logs per request.
- Circuit breakers opening.
- Thread pools saturated by waiting work.

The fix is usually a mix of timeouts, bounded retries, jitter, circuit breaking, and load shedding.

## Common code-level causes

Some patterns are repeat offenders:

- Regex on large input.
- Logging large objects.
- Repeated JSON parsing.
- Inefficient collection scans.
- Busy wait loops.
- Hash collisions or poor key distribution.
- Excessive metrics labels.
- Compression on the request path.

Profiling is the fastest way to stop arguing with intuition. Even a short CPU profile can point to the method that matters.

## Incident finish line

The incident is not over when CPU returns to normal. I want a clear explanation of:

- What changed?
- Why did CPU rise?
- Why did alerts catch it or miss it?
- What limit or guardrail should exist next time?

CPU spikes are stressful because they are visible and ambiguous. A repeatable playbook turns them into a debugging problem instead of a guessing contest.
