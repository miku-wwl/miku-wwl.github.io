---
title: 'Finding the top 100 words in a 2 GB file'
description: 'A scalable approach to word counting with streaming, partitioning, local aggregation, and heap-based top-K selection.'
pubDate: '2024-01-15'
---

# Finding the top 100 words in a 2 GB file

Finding the top 100 words in a 2 GB file is a classic data-processing problem. The best solution depends on available memory, input format, and accuracy requirements.

If memory is enough to hold all distinct words, a single-pass hash map is simple. But the safer interview-style answer assumes the distinct word set may be too large for memory.

## Streaming parser

The first step is to read the file as a stream instead of loading it all at once.

The parser should:

- Read chunks or lines.
- Normalize case if required.
- Define word boundaries clearly.
- Handle punctuation.
- Avoid splitting multibyte characters if the input is not plain ASCII.
- Emit one word at a time.

The counting algorithm is only correct if tokenization is correct.

## Partition by hash

To keep memory bounded, partition words into multiple temporary files by hash:

```text
partition = hash(word) % N
```

The same word always goes to the same partition. If `N` is chosen well, each partition becomes small enough to process in memory.

This is the key trick: the global counting problem becomes many smaller local counting problems.

## Count each partition

For each partition:

1. Load words from that partition.
2. Count them in a hash map.
3. Keep the local top 100 using a min-heap.
4. Merge the local candidates into a global min-heap.

The global heap stores only 100 items, so merging is cheap.

## Why local top-K works here

If a word is globally in the top 100, it must be in the top candidates of its own partition. Since each word belongs to exactly one partition, counting per partition does not split its frequency.

This is why hash partitioning is better than arbitrarily splitting the file and taking local top-K from chunks. If the same word appears across chunks, each chunk only sees part of the frequency.

## Approximate option

If approximate results are acceptable, a Count-Min Sketch can estimate frequencies with fixed memory. A heap can track candidate words.

This is useful for streaming systems where temporary files are undesirable, but it introduces error bounds. For an exact answer, partitioning and exact counts are safer.

## Production details

In real systems, I would also consider:

- Disk space for partitions.
- Compression tradeoffs.
- Parallel processing per partition.
- Skew from extremely frequent words.
- Stop-word handling.
- Reproducible tokenization rules.
- Observability for processing progress.

The core pattern is common in data engineering: stream the input, partition by key, aggregate locally, and merge small summaries.
