# Deployment

## Overview
The repo now includes a portable Docker deployment path in `docker-compose.prod.yml`.

It supports two modes:
- build locally on the target machine
- pull prebuilt images by setting `BACKEND_IMAGE` and `FRONTEND_IMAGE`

The backend container runs `alembic upgrade heads` automatically before starting Uvicorn, so the stack can boot with a single compose command even if the repo temporarily contains multiple migration branches.

## Required Files
On the target host, keep these files together in one app directory:
- `docker-compose.prod.yml`
- `.env`

Optional:
- a checked-out copy of the repo if you want to build locally on that machine
- prebuilt image references in environment variables if you want to pull instead of build

## Required `.env` Values
At minimum:

```env
APP_ENV=production
POSTGRES_USER=gym_admin
POSTGRES_PASSWORD=change_me_to_a_strong_password
POSTGRES_DB=gym_erp_db
POSTGRES_HOST=db
POSTGRES_PORT=5432
SECRET_KEY=change_me_to_a_long_random_secret
KIOSK_SIGNING_KEY=change_me_to_a_long_random_kiosk_secret
BACKEND_CORS_ORIGINS=["https://your-frontend-domain.example"]
NEXT_PUBLIC_KIOSK_ID=kiosk-01
RESET_LOCAL_ADMIN_ON_STARTUP=false
DEMO_SEED_ON_STARTUP=false
```

Optional overrides:

```env
PAYROLL_AUTO_ENABLED=true
SUBSCRIPTION_AUTO_ENABLED=true
SUBSCRIPTION_AUTO_INTERVAL_HOURS=6
BACKGROUND_TASKS_ENABLED_IN_TESTS=false
BACKEND_EXPOSE_PORT=8000
FRONTEND_EXPOSE_PORT=3000
POSTGRES_EXPOSE_PORT=5432
NEXT_PUBLIC_API_URL=/api/v1
BACKEND_INTERNAL_URL=http://backend:8000
BACKEND_IMAGE=ghcr.io/your-org/gym-erp-backend:tag
FRONTEND_IMAGE=ghcr.io/your-org/gym-erp-frontend:tag
```

Before production deploy, replace every `change_me...` value with a strong secret and set `BACKEND_CORS_ORIGINS` to the real HTTPS frontend origin. Do not use localhost CORS values for public production traffic.

## Deploy Anywhere
If the target machine has the repo checkout:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

If the target machine should pull already-built images:

```bash
docker compose --env-file .env -f docker-compose.prod.yml pull
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

## What Starts
This stack brings up:
- `db` on PostgreSQL 15
- `backend` on port `8000`
- `frontend` on port `3000`

The backend waits for the database and retries migrations automatically during container startup.
Payroll and subscription schedulers are enabled by default in production. Both use Postgres advisory locks so only one backend process performs each scheduled run at a time.

## Validation
After startup:

```bash
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS http://127.0.0.1:3000/login > /dev/null
```

Inspect logs with:

```bash
docker compose --env-file .env -f docker-compose.prod.yml logs -f
```

## Existing GitHub Deployment
`.github/workflows/deploy.yml` can still be used for GHCR-based deployments. With the updated container setup, the host no longer needs a separate explicit migration command when the backend starts normally.
