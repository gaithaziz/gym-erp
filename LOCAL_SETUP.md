# LOCAL_SETUP.md
Version: 1.0
Scope: Local Development Environment Setup

---

## 1. Prerequisites
Before starting, ensure you have the following installed:
* **Docker & Docker Compose** (Essential for DB & Backend)
* **Python 3.11+** (For local backend debugging)
* **Node.js 18+ & npm** (For Web Dashboard)
* **Flutter SDK** (For Mobile App)
* **PostgreSQL 15+** (Only if running outside Docker)

---

## 2. Environment Configuration
Create a `.env` file in the root directory. Copy the structure below:

```bash
# Database Configuration
POSTGRES_USER=gym_admin
POSTGRES_PASSWORD=gym_password_secret
POSTGRES_DB=gym_erp_db
POSTGRES_HOST=db  # Use 'localhost' if running outside Docker
POSTGRES_PORT=5432

# Application Secrets
SECRET_KEY=dev_secret_key_change_in_prod
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS (Frontend URLs)
BACKEND_CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]