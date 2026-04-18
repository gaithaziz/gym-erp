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

Rebuild only the backend image:

```bash
docker compose up -d --build backend
```

Important runtime note:
- Restarting containers is not always enough after backend code changes.
- If a backend permission or route change still behaves like the old code, rebuild the backend image with `docker compose up -d --build backend`.

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
npm run dev:mobile
```

Useful related commands:

```bash
npm run ios:mobile
npm run android:mobile
npm run typecheck:mobile
```

Important mobile note:
- `npm run dev:mobile` still starts Expo the same way as before.
- This does not automatically create a native development build.

Use the correct API base URL for your device:
- iPhone simulator on the same Mac: `http://localhost:8000/api/v1`
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
- `admin@gym-erp.com` / `password123`

Stop the Expo / Metro mobile process with `Ctrl+C` in the terminal where it is running.

If Expo was started in a detached `screen` session, stop it without leaving a background session:

```bash
screen -S gym-erp-expo -X quit
```

Confirm Metro is fully stopped:

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
screen -ls
```

If the second command still prints the same PID after a few seconds, force only that stale listener:
```bash
lsof -tiTCP:8081 -sTCP:LISTEN | xargs kill -9
```

If `lsof` prints nothing and `screen -ls` does not show `gym-erp-expo`, the mobile server is fully shut down.

## 5A. Expo Development Build Notes

The repo is now wired for Expo development builds because Android remote push notifications are not fully supported in Expo Go.

What changed:
- `expo-dev-client` is installed in `apps/mobile`
- `eas.json` exists at the repo root
- extra scripts are available for dev-client and native builds

Keep using Expo Go if you want:

```bash
npm run dev:mobile
```

Use these commands for a development build workflow:

```bash
npm run dev:mobile:client
npm run android:mobile:build
npm run ios:mobile:build
```

If native folders need to be regenerated:

```bash
npm run prebuild:mobile
npm run prebuild:mobile:clean
```

For EAS development builds:

```bash
eas build --profile development --platform android
```

Current environment note:
- The repo is configured for this workflow, but local Android tooling is not installed in this environment.
- `adb`, `emulator`, and `eas` may need to be installed on the machine before native dev builds can run locally.

Expo Go warning note:
- `expo-notifications` remote Android push testing is no longer supported in Expo Go.
- If you need to test remote push behavior, use a dev build instead of Expo Go.

## 5B. Recent Mobile Fix Notes

Feedback history:
- The customer feedback screen at `/feedback` is customer-only.
- Admins and coaches should use `/coach-feedback`.
- The mobile feedback screen now redirects admin and coach users to the correct queue instead of calling the customer-only endpoint.

Support:
- The support tab previously looked empty for admin users because the support query was not enabled for admin-control roles.
- The mobile support tab now fetches support tickets for `ADMIN` and `MANAGER` as well as reception/front-desk staff.

## 6. Safe Shutdown

Stop the Expo / Metro mobile process with:

```bash
Ctrl+C
```

If Expo was left running in another terminal and you want to terminate it safely:

```bash
pkill -f "expo start"
```

If Expo was left running in the detached `screen` session:

```bash
screen -S gym-erp-expo -X quit
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
