---
title: 'Kafka zero-copy: why the page cache matters'
description: 'A note on how Kafka uses the operating system page cache and zero-copy transfer to reduce CPU and memory overhead.'
pubDate: '2024-06-04'
---

# Kafka zero-copy: why the page cache matters

Kafka is fast partly because it leans on the operating system instead of fighting it. One of the most important examples is zero-copy transfer.

When a broker sends log data to a consumer, the naive path copies bytes multiple times: disk to kernel buffer, kernel buffer to user space, user space back to kernel socket buffer, and then to the network card. Those copies burn CPU and memory bandwidth.

Kafka avoids much of this by using the OS page cache and file transfer APIs such as `sendfile` or Java `FileChannel.transferTo`.

## The normal copy path

A traditional read and write path can look like this:

```text
disk -> kernel page cache -> application buffer -> socket buffer -> NIC
```

The application receives bytes only to hand them back to the kernel for network transmission. That is wasteful when the application does not need to modify the bytes.

## The zero-copy path

With zero-copy, the broker can transfer file data from the page cache to the socket with far fewer copies:

```text
disk/page cache -> socket -> NIC
```

The exact path depends on the operating system and hardware, but the principle is the same: keep bytes out of user-space buffers when the application is only forwarding them.

## Why this fits Kafka

Kafka stores messages in append-only log segments. Consumers read sequentially. This pattern is friendly to the page cache.

Benefits include:

- Sequential disk access.
- Efficient OS read-ahead.
- Less JVM heap pressure.
- Lower CPU overhead for large transfers.
- Better reuse when multiple consumers read the same data.

Kafka does not need to load every message into Java objects to serve consumers. It can move log bytes efficiently.

## Page cache as a performance layer

Kafka relies heavily on the page cache. Recently written data is already in memory, so consumers can often read without disk I/O. This is one reason Kafka can perform well even without putting all data on the JVM heap.

This also explains why giving Kafka a huge heap is not always better. Too much heap can reduce memory available for the page cache and can increase GC cost.

## Limits

Zero-copy is not magic. It helps most when data can be sent as stored. If the broker needs to decompress, transform, filter, or re-encrypt payloads in user space, the benefit may be reduced.

Network, disk, consumer speed, partition design, and replication settings can still become bottlenecks.

## Operational takeaway

Kafka performance is a system-level story. Broker heap, page cache, disk throughput, network throughput, partition count, batch size, and consumer behavior all interact.

Zero-copy is a good reminder that high-performance backend systems often win by removing unnecessary work rather than by making unnecessary work faster.
