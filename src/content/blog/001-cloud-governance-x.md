---
title: 'Cloud Governance X'
description: 'A cloud governance and FinOps platform focused on inventory, cost visibility, ETL tracking, and production-style engineering workflows.'
pubDate: 'Jul 07 2026'
heroImage: '/assets/github.png'
---

Cloud Governance X is my active engineering project for cloud resource inventory, cost visibility, ETL execution tracking, and production-oriented backend practice.

The backend foundation is built with .NET 10 and Clean Architecture-style boundaries across API, Application, Domain, Infrastructure, Worker, Migrator, and automated test projects. The persistence layer uses PostgreSQL for cloud resources, daily cost records, ETL job runs, provider accounts, tenant-aware data access, and governance metadata.

The Azure ingestion foundation uses Azure SDK, Azure Resource Graph, and Azure Cost Management Query API. I also added a dedicated database Migrator project for repeatable schema initialization, migration validation, idempotent reruns, and CI-based database checks.

The project is also a platform engineering exercise: Terraform-based Azure infrastructure scaffolding, GitHub Actions CI, architecture boundary tests, repository static checks, migration verification, and Terraform validation.
