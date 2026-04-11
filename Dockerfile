# ---- Backend ----
FROM python:3.12-slim AS backend

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .
COPY .env.example ./.env.example
COPY docker/backend-entrypoint.sh /app/docker/backend-entrypoint.sh

RUN chmod +x /app/docker/backend-entrypoint.sh

EXPOSE 8000

CMD ["/app/docker/backend-entrypoint.sh"]
