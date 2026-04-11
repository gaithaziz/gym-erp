#!/bin/sh
set -eu

echo "Waiting for database migrations to succeed..."
attempt=0
until python -m alembic upgrade head; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Database migration failed after $attempt attempts."
    exit 1
  fi
  echo "Migration attempt $attempt failed, retrying in 2s..."
  sleep 2
done

echo "Starting backend server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
