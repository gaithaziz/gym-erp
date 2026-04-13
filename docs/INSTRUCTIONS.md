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

## 4. Run Web And Mobile Together

For normal daily development with the web app and backend:

```bash
npm run dev:web
```

That brings up:
- Frontend web: `http://localhost:3000`
- Backend API: `http://127.0.0.1:8000`
- Postgres: `localhost:5432`

Health check:

```bash
curl -fsS http://127.0.0.1:8000/healthz
```

If this is your first local run for the current database volume, seed demo data:

```bash
npm run seed:all
```

## 5. Run The Mobile App

The Expo mobile app lives under `apps/mobile` and should be started separately from Docker.

From the repo root, after `npm run dev:web` is already running:

```bash
npm install
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1 npm run dev:mobile
```

Useful related commands:

```bash
npm run ios:mobile
npm run android:mobile
npm run typecheck:mobile
```

Use the correct API base URL for your device:
- iPhone simulator on the same Mac: `http://127.0.0.1:8000/api/v1`
- Android emulator: `http://10.0.2.2:8000/api/v1`
- Physical phone on the same Wi-Fi: `http://YOUR_LAN_IP:8000/api/v1`

Find your Mac LAN IP:

```bash
ipconfig getifaddr en0
```

If that returns nothing, try:

```bash
ipconfig getifaddr en1
```

Demo mobile login:
- `alice@client.com` / `GymPass123!`

## 6. Safe Shutdown

Stop the Expo / Metro mobile process with:

```bash
Ctrl+C
```

If Expo was left running in another terminal and you want to terminate it safely:

```bash
pkill -f "expo start"
```

Stop the Docker services but keep data:

```bash
npm run down
```

Fully stop and remove containers/network, while keeping named volumes:

```bash
npm run down:rm
```

If you want the same manual Docker command we used for a clean end-of-day shutdown:

```bash
docker compose down
```

Recommended end-of-day flow:

```bash
pkill -f "expo start"
npm run down:rm
```

Avoid this unless you intentionally want to wipe local database data too:

```bash
npm run down:volumes
```

## 7. Git Operations

To save and upload changes:

```bash
git add .
git commit -m "Description of your changes"
git push
```

## 8. Troubleshooting

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

## 9. EN/AR Localization Verification

From `frontend/`:

```bash
npm run i18n:check
npm run i18n:hardcoded
npm run i18n:rtl
npm run i18n:verify:strict
```
