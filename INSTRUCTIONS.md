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

## 4. Troubleshooting
### Error: "File ... npm.ps1 cannot be loaded because running scripts is disabled"
This is a Windows PowerShell security setting. To fix it, run this command in PowerShell:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try running `npm run dev` again.


# from: C:\Users\user\gym-erp
docker compose up -d --build backend frontend
docker exec gym_erp_backend alembic upgrade head


