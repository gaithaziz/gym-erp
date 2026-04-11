# Developer Guide

## 1. Run The Whole System With Docker

The standard way to run this project is through Docker Compose from the repo root.

Normal daily use:

```bash
npm run up
```

This starts the existing stack without forcing a rebuild.

First-time setup or after image/code changes:

```bash
cp .env.example .env
npm run up:build
```

Raw Docker equivalent:

```bash
docker compose up -d --build
```

What starts:
- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- Postgres: `localhost:5432`

Useful follow-up commands:

```bash
docker compose ps
docker compose logs -f
curl -fsS http://127.0.0.1:8000/healthz
```

Seed the Docker database for full testing:

```bash
npm run seed:all
```

You only need to seed once for a given Docker volume. Normal `npm run down` and `npm run up` cycles keep the database data.

Local development login notes:
- `admin@gym-erp.com` / `password123`
  - In `development`, backend startup resets this local admin password automatically.
- `admin.demo@gym-erp.com` / `DemoPass123!`
- `alice@client.com` / `GymPass123!`

## 2. Terminate The Docker Stack

Safe daily stop:

```bash
npm run down
```

This stops containers but preserves:
- containers
- network state
- named volumes
- database data

Raw Docker equivalent:

```bash
docker compose stop
```

Remove containers and network, but keep named volumes:

```bash
npm run down:rm
```

Raw Docker equivalent:

```bash
docker compose down
```

Remove containers, network, and named volumes:

```bash
npm run down:volumes
```

Raw Docker equivalent:

```bash
docker compose down -v
```

Important:
- `docker compose stop` preserves containers and DB state
- `docker compose down` removes containers and network, but keeps named volumes
- `docker compose down -v` removes named volumes too, so you will need to seed again

## 3. Rebuild And Reset

Rebuild the full stack:

```bash
npm run up:build
```

Rebuild only the frontend image:

```bash
npm run rebuild:frontend
```

Full destructive reset:

```bash
npm run reset
```

## 4. Git Operations

To save and upload changes:

```bash
git add .
git commit -m "Description of your changes"
git push
```

## 5. Troubleshooting

PowerShell script execution issue:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Remove stale browser lock entries:

```js
Object.keys(localStorage)
  .filter(k => k.startsWith('blocked_request_lock_'))
  .forEach(k => localStorage.removeItem(k));
```

## 6. EN/AR Localization Verification

From `frontend/`:

```bash
npm run i18n:check
npm run i18n:hardcoded
npm run i18n:rtl
npm run i18n:verify:strict
```
