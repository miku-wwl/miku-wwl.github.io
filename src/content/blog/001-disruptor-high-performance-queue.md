---
title: 'Disruptor: a high-performance queue built around RingBuffer and sequences'
description: 'A practical note on why Disruptor is fast, how RingBuffer, Sequencer, WaitStrategy, and consumer graphs work, and when the model is worth using.'
pubDate: '2026-06-18'
---

# Disruptor: a high-performance queue built around RingBuffer and sequences

Disruptor is often described as a queue, but that description is slightly too small. It is a coordination model for passing events between threads with very low latency. The core idea is simple: pre-allocate a ring of event objects, let producers claim slots by sequence number, and let consumers progress by tracking the sequences they have safely processed.

The design is useful when a service has a hot in-memory path: market data processing, order matching, metric pipelines, gateway fan-out, or any workflow where a queue becomes part of the latency budget.

## Why it is fast

Traditional blocking queues spend a lot of time on coordination. They allocate nodes, contend on locks, wake up blocked threads, and move data between structures. Disruptor avoids much of that cost.

The main performance choices are:

- A fixed-size `RingBuffer` instead of a growing linked structure.
- Sequence counters instead of lock-heavy queue state.
- Pre-allocated event objects to reduce allocation pressure.
- Cache-line padding around hot counters to reduce false sharing.
- Pluggable wait strategies so latency and CPU usage can be tuned per workload.

The interesting part is not one trick. The speed comes from making the memory access pattern predictable and keeping the communication protocol extremely small.

## RingBuffer as the data structure

The ring buffer is an array whose index is derived from a monotonically increasing sequence:

```text
index = sequence & (bufferSize - 1)
```

That expression works when the buffer size is a power of two. It avoids a modulo operation and turns the ring into a cheap mask operation.

The sequence keeps increasing forever, while the array position wraps around. That means a slot can only be reused after all dependent consumers have moved beyond it. This is why consumer sequences matter: they are not just progress markers, they are also backpressure signals.

## Producer flow

A producer usually follows this pattern:

1. Claim the next sequence.
2. Get the event object stored at that sequence.
3. Write data into the event.
4. Publish the sequence.

The publish step is the visibility boundary. Consumers should not read a slot just because a producer has claimed it; they should read it after the producer has published it.

For multi-producer scenarios, the sequencer has to protect claims and make sure consumers see contiguous published sequences. That is more complex than single producer mode, but it keeps the consumer side simple.

## Consumer flow

Consumers also move by sequence. A consumer waits until the next sequence is available, reads the event, processes it, and then advances its own sequence.

The model supports more than one topology:

- Work queue: multiple consumers compete for events.
- Broadcast: every consumer receives every event.
- Pipeline: one consumer stage depends on another stage.
- Diamond graph: one stage fans out, then later stages join after dependencies complete.

That dependency graph is a major advantage over a plain queue. It makes the processing order explicit.

## Wait strategies

The wait strategy controls how a consumer waits for a sequence to become available.

`BlockingWaitStrategy` is friendly to CPU usage and works well for normal service workloads. `SleepingWaitStrategy` and `YieldingWaitStrategy` reduce latency with different CPU tradeoffs. `BusySpinWaitStrategy` can be extremely low latency but burns a core and should be reserved for workloads where that cost is acceptable.

Choosing a wait strategy is not a style preference. It is a production tradeoff between latency, CPU budget, and scheduler behavior.

## When I would use it

Disruptor is a good fit when:

- Events are processed in memory.
- Allocation pressure matters.
- The queue is on a hot path.
- Processing stages have clear ordering rules.
- Backpressure should be based on consumer progress.

I would not reach for it just to replace every queue in a normal web application. For most request-response services, a bounded executor queue or a message broker is easier to operate. Disruptor becomes attractive when queue overhead is clearly visible in profiling or when the event pipeline needs deterministic sequencing.

## Operational notes

The main failure mode is pretending that Disruptor removes backpressure. It does not. If consumers are slower than producers, producers eventually have to wait for free slots. That is the correct behavior.

The other important rule is to keep event handlers predictable. A slow database call, remote HTTP request, or blocking file operation inside the consumer can destroy the latency profile. If I/O is required, I prefer to isolate it in a separate stage or hand it off to a different execution model.

The mental model is: Disruptor is not magic throughput dust. It is a precise concurrency tool. Used in the right place, it gives a clean and fast pipeline. Used casually, it can make the system harder to understand without solving the real bottleneck.
