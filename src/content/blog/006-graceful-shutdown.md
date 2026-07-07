---
title: 'Graceful shutdown for backend services'
description: 'A shutdown sequence for Kubernetes services, HTTP servers, message consumers, workers, and data integrity.'
pubDate: '2025-02-03'
---

# Graceful shutdown for backend services

Graceful shutdown means the service stops taking new work, finishes or safely hands off current work, and exits before the platform kills it. It sounds small, but it is one of the details that separates a reliable service from a service that loses data during every deployment.

In Kubernetes, shutdown usually begins with a `SIGTERM`. The container then has a termination grace period before it receives `SIGKILL`. The application must use that window deliberately.

## Stop receiving new traffic

The first step is to remove the instance from the serving path. For HTTP services, readiness should fail as soon as shutdown begins. That tells Kubernetes and load balancers to stop sending new requests.

The application should continue to serve existing connections for a short drain period. This matters because load balancers and clients may still have the old endpoint cached for a few seconds.

## Drain in-flight requests

The service should track active requests. During shutdown:

- New requests should be rejected or not accepted.
- Existing requests should be allowed to finish within a timeout.
- Long-running requests should respect cancellation.
- Background work started by a request should be completed or persisted.

The timeout must be shorter than the platform termination grace period. Otherwise the process will still be killed abruptly.

## Handle message consumers carefully

For message consumers, graceful shutdown is about offsets and acknowledgements.

A safe consumer should:

- Stop polling or claiming new messages.
- Finish messages already being processed.
- Commit offsets only after successful processing.
- Avoid acknowledging work that has not been persisted.
- Make processing idempotent so replay is safe.

If processing cannot finish in time, it is usually better to let the message be retried than to acknowledge it early and lose it.

## Protect transactions

Database transactions should not be left in an ambiguous state. During shutdown, code should avoid starting new long transactions. Existing transactions should either commit cleanly or roll back.

For workflows that span multiple resources, an outbox table or durable state machine is safer than relying on a process to survive until every side effect completes.

## Kubernetes settings that matter

Graceful shutdown is not only application code. The deployment configuration matters too:

- `terminationGracePeriodSeconds` should be long enough for normal drain.
- Readiness probes should reflect shutdown state.
- `preStop` hooks can add a short delay when load balancers need time to converge.
- Pod disruption budgets should prevent too many replicas from draining at once.
- Rolling update settings should keep enough capacity available.

These settings should be tested, not assumed.

## How I test it

A practical test is to run a load test and terminate pods during the test. I watch:

- HTTP 5xx rate.
- Request latency.
- In-flight request count.
- Consumer duplicate rate.
- Lost or stuck messages.
- Shutdown duration.

If termination causes visible errors or data loss, the deployment process is not safe yet.

Graceful shutdown is not glamorous architecture. It is operational hygiene. But it pays off every time a service is deployed, rescheduled, scaled down, or interrupted by infrastructure maintenance.
