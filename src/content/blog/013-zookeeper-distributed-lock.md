---
title: 'Distributed locks with ZooKeeper ephemeral sequential nodes'
description: 'How ZooKeeper implements lock ordering, why clients watch predecessors, and what session expiration means for correctness.'
pubDate: '2024-04-12'
---

# Distributed locks with ZooKeeper ephemeral sequential nodes

ZooKeeper can implement a distributed lock by combining two features: ephemeral nodes and sequential nodes.

The high-level idea is that every client creates a temporary sequential node under a lock path. The client with the smallest sequence number owns the lock. Other clients wait for the node immediately before them to disappear.

## Lock acquisition

The flow looks like this:

1. Client creates an ephemeral sequential node under `/locks/my-lock`.
2. Client lists all children under the lock path.
3. If its node has the smallest sequence, it owns the lock.
4. Otherwise, it watches the previous sequence node.
5. When that previous node disappears, the client checks again.

Watching the previous node is important. If every waiting client watched the smallest node, releasing one lock would wake every waiter. That creates unnecessary load and contention.

## Why ephemeral nodes matter

An ephemeral node is tied to the client session. If the client crashes or loses its session, ZooKeeper removes the node. That prevents a dead client from holding the lock forever.

This is safer than a lock stored as a normal database row without a lease. However, it does not remove every failure mode.

## Session expiration

Session expiration is the subtle part. A client may experience a long pause, network partition, or GC stall. ZooKeeper can expire its session and release the lock while the client still thinks it is running.

If that client continues to write to a protected resource, two clients may effectively act as lock owners.

This is why important distributed locks should use fencing tokens. The sequence number can act as a fencing token if the protected resource rejects writes with an older token.

## Releasing the lock

To release the lock, the client deletes its own node. If the client exits or the session expires, ZooKeeper deletes the ephemeral node automatically.

The application should still release explicitly in normal flow. Automatic cleanup is a safety net, not the normal control path.

## ZooKeeper lock properties

This approach gives:

- Fair ordering by sequence number.
- Automatic cleanup after session loss.
- Reduced herd effect by watching predecessors.
- A visible lock queue for debugging.

It also requires:

- Correct session handling.
- Timeout awareness.
- Fencing for critical resources.
- Careful retry behavior.

## When to use it

ZooKeeper locks are useful when a system already depends on ZooKeeper and needs coordinated ownership, leader election, or controlled access to a shared resource.

For simple short-lived application locks, Redis may be easier to operate. For database-row ownership, optimistic locking or transactional updates may be enough.

The rule I use is: choose the locking primitive that matches the failure model of the resource being protected. The lock is only correct if the protected resource can enforce the decision.
