# Developer Guide

## 1. Git Operations (Saving & Uploading Code)
To save your changes and upload them to the repository:

```bash
# 1. Stage all changes
git add .

# 2. Commit changes with a message
git commit -m "Description of your changes"

# 3. Push to the remote repository
# If it's your first time or you want to be sure:
git push origin main

# OR simply (if upstream is already set):
git push

git push -u origin Gaith
```

## 2. Running the Application

### Backend (FastAPI)
1. Open a terminal.
2. Navigate to the project root (`gym-erp`).
3. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```
   *The backend will start at `http://127.0.0.1:8000`.*

### Frontend (Next.js)
1. Open a **new** terminal.
2. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend will start at `http://localhost:3000`.*

## 3. Stopping the Application
To stop any running server:
1. Go to the terminal where the server is running.
2. Press **`Ctrl + C`**.
3. If prompted "Terminate batch job (Y/N)?", type `Y` and press Enter.

## 4. Docker Build / Run / Stop

From `C:\Users\user\gym-erp`:

Initial setup:
```powershell
copy .env.example .env
docker compose up -d db
docker compose run --rm backend alembic upgrade head
```

Build and run backend + frontend:
```powershell
docker compose up -d --build backend frontend
```

Build and run backend only:
```powershell
docker compose up -d --build backend
```

Stop compose services:
```powershell
docker compose stop
```

Stop and remove compose containers:
```powershell
docker compose down
```

Optional Expo web preview build for the mobile app:
```powershell
cd mobile
$env:EXPO_PUBLIC_API_URL="http://localhost:8000"
npx expo export --platform web
cd ..
docker run -d --name gym_erp_mobile_preview -p 8082:80 -v "C:/Users/user/gym-erp/mobile/dist:/usr/share/nginx/html:ro" nginx:alpine
```

Open the mobile preview at:
```text
http://localhost:8082
```

Stop the mobile preview container:
```powershell
docker rm -f gym_erp_mobile_preview
```

## 5. Troubleshooting
### Error: "File ... npm.ps1 cannot be loaded because running scripts is disabled"
This is a Windows PowerShell security setting. To fix it, run this command in PowerShell:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try running `npm run dev` again.

# removing lock
Object.keys(localStorage)
  .filter(k => k.startsWith('blocked_request_lock_'))
  .forEach(k => localStorage.removeItem(k));

## 6. EN/AR Localization Verification (Fast)
From `frontend/`:
```bash
npm run i18n:check
```
- Validates EN/AR key parity, empty values, placeholder token consistency, and suspicious Arabic values with no Arabic letters.

```bash
npm run i18n:hardcoded
```
- Scans JSX for hardcoded user-facing literals and writes:
  - `frontend/reports/i18n-hardcoded-report.json`

```bash
npm run i18n:rtl
```
- Scans for RTL-risky Tailwind/class tokens (`ml-*`, `mr-*`, `left-*`, `text-left`, `rounded-tr`, etc.) and writes:
  - `frontend/reports/rtl-risk-report.json`

Strict gate (for CI):
```bash
npm run i18n:verify:strict
```

