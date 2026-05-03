# Gym ERP Deployment Runbook

## Target Architecture

Use a serverless-container setup that keeps operational overhead low while still supporting the current Docker/FastAPI/Next.js/Postgres shape.

```text
Frontend: Vercel
Backend: Google Cloud Run
Database: Neon Postgres
Email: Resend
Uploads: Cloudflare R2 or Google Cloud Storage
Schedulers: backend scheduler for v1, Cloud Scheduler + Cloud Run Jobs later
Monitoring: Sentry + uptime checks + cloud logs
```

Expected cost for 20 gyms with 150 users each:

```text
Expected: $80-$150/month
Lean:     $40-$80/month
Higher:   $200-$500/month if media/storage/traffic grows
```

## Required Production Services

- **Vercel**
  - Hosts the Next.js frontend.
  - Set `NEXT_PUBLIC_API_URL` to the production backend API base path or gateway path.

- **Google Cloud Run**
  - Runs the FastAPI backend container.
  - Deploy the existing backend Docker image.
  - Use at least one region close to primary customers.
  - Optional for faster responses: set minimum instances to `1`.

- **Neon Postgres**
  - Hosts production Postgres.
  - Enable backups.
  - Use a separate staging database/project.
  - Map Neon connection values into the app's existing Postgres env vars.

- **Resend**
  - Sends password reset and transactional emails.
  - Start with SMTP integration because the app already supports SMTP.
  - Later improvement: add a native Resend API provider.

- **Cloudflare R2 or Google Cloud Storage**
  - Use for production uploads instead of relying on local `/static`.
  - R2 is usually cheaper for simple object storage.
  - GCS is simpler if keeping everything inside Google Cloud.

## Production Environment

Required backend env:

```env
APP_ENV=production
POSTGRES_HOST=<neon-host>
POSTGRES_PORT=5432
POSTGRES_USER=<neon-user>
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=<neon-db>
SECRET_KEY=<long-random-secret>
KIOSK_SIGNING_KEY=<long-random-secret>
BACKEND_CORS_ORIGINS=["https://your-frontend-domain.com"]
FRONTEND_BASE_URL=https://your-frontend-domain.com
NEXT_PUBLIC_KIOSK_ID=kiosk-01
RESET_LOCAL_ADMIN_ON_STARTUP=false
DEMO_SEED_ON_STARTUP=false
```

Recommended scheduler env:

```env
PAYROLL_AUTO_ENABLED=true
PAYROLL_AUTO_HOUR_LOCAL=2
PAYROLL_AUTO_MINUTE_LOCAL=0
PAYROLL_AUTO_TZ=Asia/Amman
SUBSCRIPTION_AUTO_ENABLED=true
SUBSCRIPTION_AUTO_INTERVAL_HOURS=6
BACKGROUND_TASKS_ENABLED_IN_TESTS=false
```

Resend via SMTP:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM_NAME=Gym ERP
EMAIL_FROM_ADDRESS=no-reply@yourdomain.com
EMAIL_SMTP_HOST=smtp.resend.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USERNAME=resend
EMAIL_SMTP_PASSWORD=<resend-api-key>
EMAIL_SMTP_USE_TLS=true
EMAIL_TIMEOUT_SECONDS=10
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=30
```

Do not deploy production with localhost CORS values or `change_me...` secrets.

## Resend Setup Checklist

1. Choose sending domain, for example `yourdomain.com`.
2. Add domain in Resend.
3. Add DNS records from Resend:
   - SPF
   - DKIM
   - DMARC
4. Create a Resend API key.
5. Configure SMTP env vars.
6. Set `FRONTEND_BASE_URL` to the live Vercel domain.
7. Test password reset request from a real user account.
8. Confirm email lands in inbox, not spam.
9. Confirm reset link opens `/reset-password?token=...`.
10. Confirm old sessions are invalidated after reset.

## Storage Plan

For v1, the app still has local static mounting support. For production/serverless, move user uploads to object storage before relying heavily on uploaded media.

Recommended path:

```text
Short term: keep static volume only for low-risk staging
Production: move uploads to R2 or GCS
```

Storage requirements:

- Private bucket by default.
- Public URLs only for safe public assets.
- Signed URLs for private user uploads.
- File size limits.
- File type allowlist.
- Separate staging and production buckets.

## Scheduler Plan

Current v1:

- Backend starts payroll and subscription schedulers.
- Background tasks are disabled in tests by default.
- Payroll scheduler uses Postgres advisory lock.
- Subscription scheduler uses Postgres advisory lock.

Good enough for:

```text
One or more Cloud Run instances, because advisory locks prevent duplicate scheduled work.
```

Later improvement:

```text
Cloud Scheduler -> Cloud Run Job -> run one automation command
```

Move schedulers to Cloud Run Jobs when:

- You want clearer job logs.
- You want exact cron timing.
- You want backend request-serving containers to do no background work.
- You want independent retry/dead-letter policies.

## Monitoring And Alerts

Minimum:

- Cloud Run logs enabled.
- Neon database metrics enabled.
- Uptime checks for:
  - backend `/health`
  - backend `/healthz`
  - frontend `/login`
- Alert on backend health failure.
- Alert on database health failure.
- Alert on Resend/email failures.

Recommended:

- Add Sentry for backend and frontend errors.
- Add alert for migration failure during deploy.
- Add log search/alert for:
  - `Health check failed`
  - `Failed to send password reset email`
  - `Payroll scheduler iteration failed`
  - `Subscription scheduler iteration failed`

## Deployment Flow

1. Merge only after CI passes:
   - backend tests
   - frontend lint
   - frontend typecheck
   - frontend build
   - Docker image build
2. Deploy to staging first.
3. Run migrations automatically through backend container startup.
4. Smoke test staging:
   - `GET /healthz`
   - frontend `/login`
   - login as seeded/admin test user
   - password reset request
   - one basic tenant/gym workflow
5. Promote the same image tags to production.
6. Smoke test production:
   - `GET /healthz`
   - frontend `/login`
   - password reset email
7. Watch logs for 15-30 minutes.

## Local Readiness Commands

Run before deploying:

```bash
python3 -m py_compile app/main.py app/core/schedulers.py app/core/startup.py app/config.py tests/test_app_lifecycle.py
.venv/bin/pytest -q
npm run lint:web
npm run typecheck:web
npm run build --workspace frontend
docker compose -f docker-compose.prod.yml config
docker build -t gym-erp-backend:local .
docker build -t gym-erp-frontend:local -f frontend/Dockerfile .
```

Current known lint status:

```text
Frontend lint passes with warnings.
```

## Production Cutover Checklist

- Production domain connected to Vercel.
- Backend Cloud Run URL or custom API domain ready.
- `BACKEND_CORS_ORIGINS` points to production frontend.
- `FRONTEND_BASE_URL` points to production frontend.
- Neon production database created.
- Neon backups enabled.
- Resend domain verified.
- SMTP env configured.
- Upload bucket created.
- Sentry project configured.
- Uptime checks configured.
- Strong secrets configured.
- `RESET_LOCAL_ADMIN_ON_STARTUP=false`.
- `DEMO_SEED_ON_STARTUP=false`.
- Staging deploy tested.
- Production smoke test passed.

## Open Improvements

- Add native Resend API provider instead of SMTP-only.
- Move uploads from local static storage to R2/GCS.
- Move schedulers to Cloud Scheduler + Cloud Run Jobs.
- Hide password reset account existence if stricter privacy is needed.
- Add a formal tenant onboarding script/workflow.
- Add data export/delete operational process.
