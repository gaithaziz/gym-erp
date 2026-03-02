# Tech Stack

This document is the canonical technical stack reference for the current `gym-erp` repository.

## Current Stack

### Backend

- Language: Python 3.12
- Framework: FastAPI
- ASGI server: Uvicorn
- ORM/data access: SQLAlchemy 2.x with async usage
- Database driver: `asyncpg`
- Migrations: Alembic
- Settings/config: `pydantic-settings`
- Authentication/security:
  - JWT via `python-jose[cryptography]`
  - password hashing via `passlib[bcrypt]` and `bcrypt`
- Upload handling: `python-multipart`
- Validation helpers: `email-validator`
- Reporting/PDF-related dependencies:
  - `reportlab`
  - `arabic-reshaper`
  - `python-bidi`

### Database

- Primary database: PostgreSQL
- Local dev database: Docker Compose Postgres service
- Migrations managed with Alembic

### Web Frontend

- Framework: Next.js 16
- Language: TypeScript
- UI runtime: React 19
- Styling:
  - Tailwind CSS 4
  - `tailwind-merge`
- Motion/animation: `framer-motion`
- Data fetching:
  - `axios`
  - `swr`
- Charts/data visualization: `recharts`
- Date handling: `date-fns`
- Icons: `lucide-react`
- QR/UI utilities:
  - `qrcode.react`
  - `jsqr`
- Theme support: `next-themes`
- Additional UI helpers:
  - `clsx`
  - `react-day-picker`
  - `react-grid-layout`
  - `react-easy-crop`

### Mobile App

- Framework: React Native + Expo
- Language: TypeScript
- Expo SDK: 54
- Routing: `expo-router`
- UI runtime: React 19
- Native runtime: React Native 0.81
- Data fetching/server state:
  - `axios`
  - `@tanstack/react-query`
- Styling:
  - NativeWind
  - Tailwind CSS 3 for NativeWind integration
- Storage:
  - `expo-secure-store` for secure token storage
  - `@react-native-async-storage/async-storage` where non-secure persistence is needed
- Native platform helpers:
  - `react-native-gesture-handler`
  - `react-native-reanimated`
  - `react-native-safe-area-context`
  - `react-native-screens`
- Web preview/support: `react-native-web`
- Validation: `zod`
- Device targets:
  - phone support
  - tablet support, including iPad (`mobile/app.json` has `ios.supportsTablet: true`)

### Shared Workspace Packages

- Monorepo/workspaces: npm workspaces
- Shared packages:
  - `@gym-erp/contracts`
  - `@gym-erp/i18n`
- Shared contracts validation: `zod`
- Shared localization: English and Arabic dictionaries/types/helpers

## Tooling

### Package and dependency management

- Python dependencies: `requirements.txt`
- JavaScript/TypeScript package manager: npm
- Workspace root: `package.json`

### Testing and quality

- Backend tests:
  - `pytest`
  - `pytest-asyncio`
  - `httpx` for API test support
- Web quality/tooling:
  - TypeScript type checking
  - ESLint
  - Playwright for E2E and visual coverage
  - custom i18n and RTL verification scripts
- Mobile quality/tooling:
  - TypeScript type checking

### Localization

- Primary locales: English (`en`) and Arabic (`ar`)
- Directionality support: LTR + RTL
- Shared i18n package consumed by web and mobile
- Additional repo-specific i18n/RTL coverage docs live under `frontend/docs/`

## Containers and Runtime

### Backend container

- Base image: `python:3.12-slim`
- Process: `uvicorn app.main:app`

### Frontend container

- Base image: `node:22-slim`
- Multi-stage build:
  - dependency stage
  - build stage
  - production runner stage
- Runtime mode: Next.js standalone output

### Local orchestration

- Docker Compose for local services
- Compose files:
  - `docker-compose.yml`
  - `docker-compose.prod.yml`

## Deployment Direction

- Current documented deployment flow: GitHub Actions
- Image registry target: GHCR
- Production runtime model: Docker Compose on a host
- Historical/planned infrastructure references mention Google Cloud Run, but the active repo deployment documentation is GitHub Actions plus container deployment as documented in `DEPLOYMENT.md`

## Deprecated / Not Current

- Flutter is not part of the active stack
- The active mobile stack is React Native + Expo
- Older planning documents that mention Flutter should be treated as historical unless they explicitly redirect to the current mobile docs

## Canonical References

- `requirements.txt`
- `package.json`
- `frontend/package.json`
- `mobile/package.json`
- `packages/contracts/package.json`
- `packages/i18n/package.json`
- `Dockerfile`
- `frontend/Dockerfile`
- `mobile/app.json`
- `MobilePlan.md`
- `DEPLOYMENT.md`
