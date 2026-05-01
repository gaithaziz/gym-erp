# CI/CD And Deployment Status

This document captures the current state of the repository CI/CD pipeline and what it means for deployment readiness.

## Current Status

- The main CI pipeline is green.
- The push gate now runs the full backend test suite, not just a smoke subset.
- Mobile API coverage is included in that backend suite.
- The deploy workflow is still separate and is triggered from the CI success path on `main`.

## What CI Runs

The main pipeline lives in [`.github/workflows/ci.yml`](/Users/alex/gym-erp/.github/workflows/ci.yml).

On push and pull request to `main`, it currently runs:

- `backend-full-suite`
  - installs backend dependencies
  - runs Alembic migrations
  - runs `pytest -q`
- `frontend-quality`
  - lint
  - typecheck
  - i18n key check
  - production build
- `image-build`
  - builds backend and frontend images
- `compose-smoke`
  - starts PostgreSQL
  - waits for the database
  - runs backend migrations in compose
  - starts the application stack
  - checks backend health
  - checks the frontend login page

## Mobile Coverage

Mobile is covered automatically by the backend suite because the tests already live in the standard `tests/` tree.

Relevant files include:

- [`tests/test_mobile_customer.py`](/Users/alex/gym-erp/tests/test_mobile_customer.py)
- [`tests/test_phase3_4.py`](/Users/alex/gym-erp/tests/test_phase3_4.py)
- [`tests/test_roles_feedback_notifications.py`](/Users/alex/gym-erp/tests/test_roles_feedback_notifications.py)

So the current CI gate does not need a separate mobile job to validate the mobile backend surface.

## Manual Full Regression

The manual regression workflow lives in [`.github/workflows/full-regression.yml`](/Users/alex/gym-erp/.github/workflows/full-regression.yml).

It is reserved for heavier checks such as:

- full backend `pytest -q`
- branching regression tests
- frontend smoke E2E
- dependency/security audit

## Deployment Workflow

The deploy workflow lives in [`.github/workflows/deploy.yml`](/Users/alex/gym-erp/.github/workflows/deploy.yml).

It:

- builds and pushes backend/frontend images to GHCR
- copies `docker-compose.prod.yml` to the production host
- deploys the stack on the remote server
- performs smoke checks against the live app
- keeps rollback data for the previous image set

## Deployment Readiness

From the code and CI perspective, the repo is deployment-ready.

What that means here:

- CI is green on `main`
- the full backend suite is part of the normal gate
- mobile tests are included in that suite
- compose smoke checks pass

What still has to exist outside the repo:

- production secrets
- a reachable production host
- the `.env` file and compose files on that host

## Notes

- The frontend still has non-blocking lint warnings in a few files, but they do not fail the pipeline.
- If you need a separate native mobile app UI test pipeline later, that should be added as a distinct workflow. It is not required for the current backend mobile API coverage.

## Bottom Line

The current repo state is:

- CI green
- full backend coverage in the push gate
- mobile backend coverage included
- deployment flow documented and ready for use
