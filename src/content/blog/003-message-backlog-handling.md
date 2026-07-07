---
title: 'Handling a large message backlog in production'
description: 'A practical incident playbook for stabilizing producers, scaling consumers, isolating poison messages, and draining a queue safely.'
pubDate: '2025-11-07'
---

# Handling a large message backlog in production

A message backlog is not only a queue problem. It is usually a symptom of a system that has lost balance: producers are faster than consumers, consumers are failing, partitions are skewed, or downstream dependencies are slow.

The first rule is simple: do not blindly add consumers before understanding why the backlog appeared. More consumers can amplify a database bottleneck, increase retry storms, or make ordering problems worse.

## Confirm the shape of the incident

I start by answering a few questions:

- Is the backlog growing, stable, or shrinking?
- Which topic, partition, stream, or consumer group is affected?
- Is the problem global or isolated to one tenant or key range?
- Are consumers slow, failing, or paused?
- Did traffic increase, a deployment happen, or a downstream dependency degrade?

These questions decide whether the right action is throttling producers, scaling consumers, fixing a poison message, or protecting a dependency.

## Stabilize ingestion

If the backlog is still growing and the consumer side is already under pressure, stabilize the input first.

Options include:

- Temporarily rate limit producers.
- Disable non-critical producers.
- Reduce batch import speed.
- Move low-priority traffic to a separate topic or queue.
- Apply backpressure to API endpoints that enqueue work.

This step is not about solving the whole incident. It buys time and prevents the queue from becoming impossible to drain.

## Check consumer health

Consumer lag can increase because consumers are not running, but it can also increase because every message takes too long.

Useful signals include:

- Processing latency per message.
- Error rate and retry count.
- Downstream database or API latency.
- Consumer CPU, memory, and GC behavior.
- Partition distribution across consumer instances.
- Dead-letter queue volume.

If consumers are failing repeatedly on the same message, scaling will not help. The system needs poison-message isolation, schema compatibility checks, or a code rollback.

## Scale carefully

Adding consumers helps only when parallelism is available. In Kafka, consumer concurrency is bounded by partition count for a consumer group. If a topic has 12 partitions, starting 50 consumers will not give 50 active consumers.

When scaling does make sense, I prefer gradual changes:

1. Increase consumers by a small step.
2. Watch downstream dependency pressure.
3. Watch lag reduction rate.
4. Repeat only if the system remains healthy.

For batch consumers, increasing batch size can be more effective than increasing instance count. But larger batches can also increase lock time, transaction size, and retry cost.

## Isolate bad messages

A single bad message should not block the whole stream forever. The consumer should have a clear retry policy and a dead-letter path.

Good retry behavior usually includes:

- Limited retries for deterministic failures.
- Exponential backoff for temporary dependencies.
- Idempotent processing.
- Dead-letter records with enough context for replay.
- Alerts when DLQ volume exceeds a small threshold.

The worst design is infinite retry without visibility. It hides the real issue and keeps the consumer group busy doing work that cannot succeed.

## Drain and verify

After the immediate cause is fixed, the backlog still needs to be drained safely. I watch the lag slope instead of only the absolute lag. If lag is falling at a predictable rate and downstream systems are stable, the incident is under control.

The post-incident work matters:

- Add lag-based alerts.
- Add producer rate controls.
- Document replay and DLQ procedures.
- Load test consumers with realistic downstream latency.
- Review partition keys for skew.

A queue gives the system buffer, not infinite capacity. The healthiest backlog strategy is to make overload visible early and make recovery boring.
