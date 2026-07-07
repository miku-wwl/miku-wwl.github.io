---
title: 'Blue-green deployment without downtime'
description: 'A practical deployment strategy for switching traffic between two environments while keeping rollback simple.'
pubDate: '2024-12-10'
---

# Blue-green deployment without downtime

Blue-green deployment keeps two production-like environments: one currently serving traffic and one prepared for the next release. The release is deployed to the idle environment, verified, and then traffic is switched.

The main value is not only zero downtime. The real value is a fast rollback path. If the new version fails, traffic can move back to the previous environment.

## The basic flow

A typical flow looks like this:

1. Blue is live.
2. Deploy the new version to green.
3. Run smoke tests against green.
4. Warm caches and verify health.
5. Switch traffic from blue to green.
6. Keep blue available for rollback.
7. Retire blue after confidence is high.

The traffic switch can happen at a load balancer, ingress, service mesh, DNS layer, or platform router.

## Database compatibility is the hard part

The application switch is usually easier than the data model. If the new version requires a schema change, the old and new versions may run against the same database during the transition.

This means schema changes should be backward compatible:

- Add columns before using them.
- Avoid dropping columns in the same release that stops using them.
- Make writes compatible with both versions.
- Backfill data before enforcing new assumptions.
- Remove old schema only after the old version is gone.

This is often called expand and contract. Blue-green without database compatibility is only half a deployment strategy.

## Smoke tests before the switch

The green environment should be tested before receiving real traffic. Useful checks include:

- Health endpoints.
- Key API flows.
- Database connectivity.
- Message broker connectivity.
- Configuration and secrets.
- External dependency reachability.
- Observability signals.

Smoke tests should be fast and boring. Their job is to catch obvious release mistakes before users do.

## Traffic switch and monitoring

After the switch, I watch high-signal metrics:

- Error rate.
- Latency percentiles.
- Saturation.
- Business transaction success rate.
- Queue lag.
- Downstream dependency errors.

The rollback decision should be made from predefined signals, not from panic. If error rate exceeds a threshold for a defined window, switch back.

## Limitations

Blue-green deployment can be expensive because it requires duplicate capacity. It can also be awkward for stateful systems, long-running jobs, and services with sticky sessions.

For some workloads, canary deployment is safer because it exposes only a small percentage of traffic to the new version. For other workloads, blue-green is better because it keeps rollback simple and avoids mixed-version traffic.

The right deployment strategy depends on the service. The key is to make release risk explicit: what can fail, how quickly can it be detected, and how quickly can the system return to a known-good state?
