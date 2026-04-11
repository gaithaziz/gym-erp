# Go-Live Checklist (Gym ERP on GCP)

Use this before final production launch on Google Cloud Platform.

## 0) Deployment Target Decision (Choose One)

- [ ] `Cloud Run` (recommended for your current size and ops simplicity).
- [ ] `GKE` (use later if orchestration complexity/scale requires it).
- [ ] `Compute Engine + Docker Compose` (valid, but more manual ops).

## 1) GCP Identity, Access, and Secrets

- [ ] Use separate GCP projects at minimum: `staging` and `production`.
- [ ] Enforce least-privilege IAM roles for all users and service accounts.
- [ ] Use GitHub OIDC (Workload Identity Federation), avoid long-lived GCP keys in GitHub secrets.
- [ ] Store app secrets in `Secret Manager`:
  - [ ] `SECRET_KEY`
  - [ ] `KIOSK_SIGNING_KEY`
  - [ ] database credentials (if not IAM DB auth)
  - [ ] external API tokens
- [ ] Enable Secret Manager access audit logs.
- [ ] Rotate secrets and document rotation schedule.

## 2) Network and Perimeter Security

- [ ] Keep database private (no public `5432` exposure).
- [ ] Use private connectivity for DB access (Private IP / Serverless VPC connector where applicable).
- [ ] Restrict ingress with firewall rules and only required ports.
- [ ] Put HTTPS load balancing in front of public services.
- [ ] Add Cloud Armor policies (basic WAF/rate control).
- [ ] Confirm strict CORS allowlist for production origins only.

## 3) Runtime and Application Security

- [ ] Move web auth tokens from browser storage to `HttpOnly` + `Secure` cookies.
- [ ] Add strict upload validation (content sniffing, extension allowlist, max size).
- [ ] Ensure production config validation blocks weak/missing secrets.
- [ ] Keep dependency scanning and SAST active in CI.
- [ ] Use non-root containers where possible and minimal base images.

## 4) Data Layer (Cloud SQL / Postgres)

- [ ] Use Cloud SQL for PostgreSQL (recommended) or hardened managed Postgres.
- [ ] Enable automatic backups and point-in-time recovery.
- [ ] Validate restore procedure in staging.
- [ ] Configure connection pooling strategy.
- [ ] Define DB maintenance/upgrade window.
- [ ] Configure alerts for CPU, storage, connection count, and slow queries.

## 5) Artifact and Build Pipeline

- [ ] Push images to `Artifact Registry` (GCP-native).
- [ ] Pin base image versions and scan images for vulnerabilities.
- [ ] Keep CI gates:
  - [ ] tests
  - [ ] lint/type checks
  - [ ] dependency audits (fail on actionable vulns)
  - [ ] smoke checks
- [ ] Add deployment concurrency control to avoid overlapping releases.
- [ ] Protect `main` branch with required checks and reviews.

## 6) Deployment and Rollback

- [ ] Deploy staging first, then production with explicit approval gate.
- [ ] Run DB migrations as controlled release step.
- [ ] Keep previous release artifacts for fast rollback.
- [ ] Document rollback commands and decision criteria.
- [ ] Verify post-deploy health checks from inside and outside GCP.

## 7) Performance and Scale Readiness

- [ ] Set CPU/memory requests/limits appropriate to workload.
- [ ] Define autoscaling thresholds (if Cloud Run/GKE autoscaling used).
- [ ] Add Redis (`Memorystore`) for shared rate limiting/caching if multi-instance.
- [ ] Load test realistic scenarios (login, check-in, billing/reporting).
- [ ] Confirm headroom for expected concurrent users, not just total user count.

## 8) Observability and Incident Response

- [ ] Centralize logs in `Cloud Logging`.
- [ ] Create dashboards in `Cloud Monitoring`:
  - [ ] error rate
  - [ ] p95 latency
  - [ ] DB latency/connections
  - [ ] CPU/memory
  - [ ] queue/cache metrics (if used)
- [ ] Configure alert policies and notification channels.
- [ ] Add uptime checks against public endpoints.
- [ ] Maintain incident runbook:
  - [ ] rollback
  - [ ] DB restore
  - [ ] secret rotation
  - [ ] outage communication

## 9) Multi-Tenant and Compliance Basics

- [ ] Validate tenant isolation in API and DB access paths.
- [ ] Verify role/permission enforcement for all sensitive endpoints.
- [ ] Test cross-tenant access attempts (must fail).
- [ ] Define retention/deletion policy per tenant and legal requirements.
- [ ] Ensure audit logging for admin/security-sensitive actions.
- [ ] Publish Privacy Policy and Terms of Service.

## 10) Pre-Launch Final Gate

- [ ] Staging sign-off completed.
- [ ] Backup and restore drill passed.
- [ ] Security-critical checklist items completed.
- [ ] Monitoring and alerts are active and tested.
- [ ] Rollback has been tested end-to-end.
- [ ] Freeze non-critical changes 24-48 hours before launch.

---

## Suggested Launch Readiness Rule

Only launch when every item in sections 1, 2, 4, 5, 6, and 10 is complete.
