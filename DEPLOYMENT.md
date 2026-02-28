# Deployment

## Overview
Production deployment is handled by GitHub Actions in `.github/workflows/deploy.yml`.

The workflow:
- builds backend and frontend images
- pushes them to GHCR using the commit SHA as the tag
- copies `docker-compose.prod.yml` to the production host
- pulls the new images on the host
- runs `alembic upgrade head` as an explicit one-off step
- restarts the application services
- verifies `http://127.0.0.1:8000/healthz` and `http://127.0.0.1:3000/login`

## Required GitHub Secrets
- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_PRIVATE_KEY`
- `PROD_APP_DIR`

## Required Host Files
The production host directory, typically `/opt/gym-erp`, must contain:
- `.env`
- `static/`

The `.env` file should define the production runtime values, including:
- `APP_ENV=production`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `SECRET_KEY`
- `KIOSK_SIGNING_KEY`
- `BACKEND_CORS_ORIGINS`
- `NEXT_PUBLIC_KIOSK_ID`

## Manual Validation
After a deployment, verify:
- `curl -fsS http://127.0.0.1:8000/healthz`
- `curl -fsS http://127.0.0.1:3000/login > /dev/null`

To inspect service logs:

```bash
docker compose --env-file .env --env-file .deploy-images.current.env -f docker-compose.prod.yml logs -f backend frontend
```

## Manual Rollback
If the automated deployment fails after images were updated, restore the previous image set:

```bash
docker compose --env-file .env --env-file .deploy-images.previous.env -f docker-compose.prod.yml pull
docker compose --env-file .env --env-file .deploy-images.previous.env -f docker-compose.prod.yml up -d db backend frontend
```
