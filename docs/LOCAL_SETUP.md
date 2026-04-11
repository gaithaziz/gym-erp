# LOCAL_SETUP.md
Version: 1.0
Scope: Local Development Environment Setup

---

## 1. Prerequisites
Before starting, ensure you have the following installed:
* **Docker & Docker Compose** (Primary runtime for the full stack)
* **Python 3.11+** (Optional, for debugging scripts only)
* **Node.js 18+ & npm** (Optional, for frontend tooling only)
* **PostgreSQL 15+** (Only if running outside Docker)

---

## 2. Environment Configuration
Create a `.env` file in the root directory. Copy the structure below:

```bash
# Database Configuration
POSTGRES_USER=gym_admin
POSTGRES_PASSWORD=gym_password_secret
POSTGRES_DB=gym_erp_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Application Secrets
SECRET_KEY=dev_secret_key_change_in_prod
KIOSK_SIGNING_KEY=dev_kiosk_signing_key_change_in_prod  # Optional, falls back to SECRET_KEY when unset
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS (Frontend URLs)
BACKEND_CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]

# Frontend Public Config
NEXT_PUBLIC_KIOSK_ID=kiosk-01
NEXT_PUBLIC_API_URL=/api/v1
BACKEND_INTERNAL_URL=http://backend:8000
```

For multiple kiosk deployments, assign a unique `NEXT_PUBLIC_KIOSK_ID` per deployment and restart the frontend process for the change to take effect.

## 3. Default Run Workflow
Normal daily start:

```bash
npm run up
```

First run or after Docker-relevant code/image changes:

```bash
npm run up:build
```

Raw Docker rebuild/start equivalent:

```bash
docker compose up -d --build
```

The backend now runs migrations automatically when the container starts.

Safe daily stop:

```bash
npm run down
```

If you want to remove containers but keep data:

```bash
npm run down:rm
```

If you want a full reset including volumes:

```bash
npm run down:volumes
```

Seed demo data if you want a ready-to-test environment:

```bash
docker compose exec backend python -m app.seed_demo_data
```

## 4. PostgreSQL-Backed Test Workflow
Backend integration tests require PostgreSQL in all environments.

Run tests from the repo root:

```bash
pytest -q
```

If you want a separate test database locally, point `.env` to it before running `pytest`.
