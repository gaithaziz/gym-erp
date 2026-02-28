from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, get_args, get_origin

from fastapi import FastAPI
from fastapi.params import Body, Form, Header, Path as PathParam, Query
from pydantic import BaseModel

from app.config import settings
from app.security_audit.models import (
    SecurityAuditResponse,
    SecurityAuditSummary,
    SecurityCheckResult,
)


ROOT_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_DIR = ROOT_DIR / "alembic"
ENV_EXAMPLE_PATH = ROOT_DIR / ".env.example"
BACKEND_DEP_AUDIT_PATH = ROOT_DIR / "reports" / "backend-dependency-audit.json"
FRONTEND_DEP_AUDIT_PATH = ROOT_DIR / "frontend" / "reports" / "dependency-audit.json"
TRACKED_SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yml", ".yaml", ".env", ".md"}
PUBLIC_SECRET_ENV_PATTERNS = ("SECRET", "TOKEN", "API_KEY", "PASSWORD")
PLACEHOLDER_PATTERNS = ("changeme", "example", "placeholder", "secret", "password", "super_secret", "test", "demo")
SECRET_SCAN_ALLOWLIST = {
    ".github/workflows/ci.yml",
    "app/seed_demo_data.py",
}
REQUIRED_RATE_LIMITED_ROUTES = {
    "POST /api/v1/auth/login",
    "POST /api/v1/auth/refresh",
    "POST /api/v1/access/kiosk/auth",
    "POST /api/v1/access/scan",
    "POST /api/v1/access/scan-session",
}
REQUIRED_CORS_HEADERS = {"Authorization", "Content-Type", "X-Kiosk-Id", "X-Kiosk-Token", "X-Request-ID"}
EXPECTED_CORS_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}


def _normalize_route_key(method: str, path: str) -> str:
    return f"{method.upper()} {path}"


def _build_summary(checks: list[SecurityCheckResult]) -> SecurityAuditSummary:
    passed = sum(1 for check in checks if check.status == "pass")
    warnings = sum(1 for check in checks if check.status == "warn")
    failed = sum(1 for check in checks if check.status == "fail")
    not_applicable = sum(1 for check in checks if check.status == "not_applicable")
    overall_status = "fail" if failed else "warn" if warnings else "pass"
    return SecurityAuditSummary(
        overall_status=overall_status,
        passed=passed,
        warnings=warnings,
        failed=failed,
        not_applicable=not_applicable,
    )


def _is_placeholder_secret(value: str | None) -> bool:
    if not value:
        return True
    normalized = value.strip().lower()
    return len(normalized) < 24 or any(token in normalized for token in PLACEHOLDER_PATTERNS)


def _load_json_report(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _tracked_repo_files() -> list[Path]:
    try:
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        files = []
        for line in result.stdout.splitlines():
            if not line:
                continue
            path = ROOT_DIR / line
            if path.is_file():
                files.append(path)
        return files
    except Exception:
        files: list[Path] = []
        for base_dir in (ROOT_DIR / "app", ROOT_DIR / "frontend", ROOT_DIR / "tests", ROOT_DIR / ".github"):
            if not base_dir.exists():
                continue
            for path in base_dir.rglob("*"):
                if path.is_file():
                    files.append(path)
        for path in (ROOT_DIR / ".env", ROOT_DIR / ".env.example", ROOT_DIR / "docker-compose.yml", ROOT_DIR / "requirements.txt"):
            if path.exists():
                files.append(path)
        return files


def _dependency_check() -> SecurityCheckResult:
    backend_report = _load_json_report(BACKEND_DEP_AUDIT_PATH)
    frontend_report = _load_json_report(FRONTEND_DEP_AUDIT_PATH)

    if not backend_report and not frontend_report:
        return SecurityCheckResult(
            id="dependency-audit-reports",
            category="dependencies",
            title="Dependency audit reports",
            status="warn",
            summary="No dependency audit reports were found.",
            details=[
                f"Expected backend report at {BACKEND_DEP_AUDIT_PATH.relative_to(ROOT_DIR)}",
                f"Expected frontend report at {FRONTEND_DEP_AUDIT_PATH.relative_to(ROOT_DIR)}",
            ],
            recommended_action="Run the dependency audit scripts or CI workflow to generate reports.",
        )

    details: list[str] = []
    evidence: list[str] = []
    total_vulns = 0
    high_or_critical = 0

    if backend_report is not None:
        deps = backend_report.get("dependencies", []) if isinstance(backend_report, dict) else []
        backend_vulns = sum(len(dep.get("vulns", [])) for dep in deps if isinstance(dep, dict))
        backend_high = sum(
            1
            for dep in deps
            if isinstance(dep, dict)
            for vuln in dep.get("vulns", [])
            if isinstance(vuln, dict) and str(vuln.get("severity", "")).lower() in {"high", "critical"}
        )
        total_vulns += backend_vulns
        high_or_critical += backend_high
        details.append(f"Backend dependency findings: {backend_vulns}")
        evidence.append(f"Backend report present: {BACKEND_DEP_AUDIT_PATH.relative_to(ROOT_DIR)}")

    if frontend_report is not None:
        metadata = frontend_report.get("metadata", {}) if isinstance(frontend_report, dict) else {}
        vulnerabilities = metadata.get("vulnerabilities", {}) if isinstance(metadata, dict) else {}
        frontend_total = sum(
            int(vulnerabilities.get(level, 0))
            for level in ("low", "moderate", "high", "critical")
            if str(vulnerabilities.get(level, 0)).isdigit() or isinstance(vulnerabilities.get(level, 0), int)
        )
        frontend_high = int(vulnerabilities.get("high", 0) or 0) + int(vulnerabilities.get("critical", 0) or 0)
        total_vulns += frontend_total
        high_or_critical += frontend_high
        details.append(f"Frontend dependency findings: {frontend_total}")
        evidence.append(f"Frontend report present: {FRONTEND_DEP_AUDIT_PATH.relative_to(ROOT_DIR)}")

    status = "fail" if high_or_critical else "warn" if total_vulns else "pass"
    summary = (
        f"Dependency audit found {high_or_critical} high/critical vulnerabilities."
        if high_or_critical
        else f"Dependency audit found {total_vulns} lower-severity vulnerabilities."
        if total_vulns
        else "Dependency audit reports show no known vulnerabilities."
    )
    return SecurityCheckResult(
        id="dependency-audit-reports",
        category="dependencies",
        title="Dependency audit reports",
        status=status,
        summary=summary,
        details=details,
        evidence=evidence,
        recommended_action="Resolve high/critical production dependency issues before release." if high_or_critical else None,
    )


def _row_level_security_check() -> SecurityCheckResult:
    migration_text = []
    if ALEMBIC_DIR.exists():
        for path in ALEMBIC_DIR.rglob("*.py"):
            try:
                migration_text.append(path.read_text(encoding="utf-8"))
            except Exception:
                continue
    joined = "\n".join(migration_text)
    rls_tokens = ("ENABLE ROW LEVEL SECURITY", "CREATE POLICY", "FORCE ROW LEVEL SECURITY")
    has_enable = "ENABLE ROW LEVEL SECURITY" in joined
    has_policy = "CREATE POLICY" in joined
    has_force = "FORCE ROW LEVEL SECURITY" in joined
    if has_enable and has_policy and has_force:
        return SecurityCheckResult(
            id="postgres-rls",
            category="row_level_security",
            title="PostgreSQL Row Level Security",
            status="pass",
            summary="RLS policies with FORCE enforcement were found in migrations.",
            evidence=["Detected ENABLE/FORCE RLS and CREATE POLICY statements in Alembic migrations."],
        )

    return SecurityCheckResult(
        id="postgres-rls",
        category="row_level_security",
        title="PostgreSQL Row Level Security",
        status="warn",
        summary="No database-level RLS policies were found.",
        details=[
            "Current authorization appears to rely on application-layer role checks and ownership filters.",
            "This is acceptable for the current single-tenant setup but is weaker than DB-enforced isolation.",
        ],
        recommended_action="Add PostgreSQL RLS policies if stronger database-enforced access boundaries are required.",
    )


def _env_var_check() -> SecurityCheckResult:
    details: list[str] = []
    evidence: list[str] = []
    failures: list[str] = []
    warnings: list[str] = []

    required_values = {
        "POSTGRES_HOST": settings.POSTGRES_HOST,
        "POSTGRES_USER": settings.POSTGRES_USER,
        "POSTGRES_PASSWORD": settings.POSTGRES_PASSWORD,
        "POSTGRES_DB": settings.POSTGRES_DB,
        "SECRET_KEY": settings.SECRET_KEY,
    }
    missing = [name for name, value in required_values.items() if not value]
    if missing:
        failures.append(f"Missing required settings: {', '.join(missing)}")

    if settings.APP_ENV == "production":
        if _is_placeholder_secret(settings.SECRET_KEY):
            failures.append("SECRET_KEY is weak or placeholder-like for production.")
        if not settings.KIOSK_SIGNING_KEY or _is_placeholder_secret(settings.KIOSK_SIGNING_KEY):
            failures.append("KIOSK_SIGNING_KEY must be set to a strong secret in production.")
        if not settings.BACKEND_CORS_ORIGINS:
            failures.append("BACKEND_CORS_ORIGINS must be explicitly configured in production.")

    if ENV_EXAMPLE_PATH.exists():
        evidence.append(f"Env example present: {ENV_EXAMPLE_PATH.relative_to(ROOT_DIR)}")
    elif settings.APP_ENV == "production":
        warnings.append("Missing .env.example template.")

    dot_env_path = ROOT_DIR / ".env"
    if dot_env_path.exists():
        warnings.append("Tracked .env file exists in the repo root; verify secrets are not committed.")
        evidence.append(f"Tracked env file present: {dot_env_path.relative_to(ROOT_DIR)}")

    details.extend(failures)
    details.extend(warnings)
    status = "fail" if failures else "warn" if warnings else "pass"
    summary = (
        "Environment configuration has blocking issues."
        if failures
        else "Environment configuration has non-blocking warnings."
        if warnings
        else "Environment configuration is documented and looks valid."
    )
    return SecurityCheckResult(
        id="env-var-configuration",
        category="env_vars",
        title="Environment variables",
        status=status,
        summary=summary,
        details=details,
        evidence=evidence,
        recommended_action="Provide strong secrets via environment variables and keep .env.example as the documented template." if failures or warnings else None,
    )


def _cors_check() -> SecurityCheckResult:
    details: list[str] = []
    evidence: list[str] = []
    failures: list[str] = []
    warnings: list[str] = []

    origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS]
    evidence.append(f"Configured explicit origins: {len(origins)}")

    if settings.APP_ENV == "production":
        if not origins:
            failures.append("No explicit BACKEND_CORS_ORIGINS are configured for production.")
        if any("localhost" in origin or "127.0.0.1" in origin for origin in origins):
            failures.append("Production CORS origins include localhost addresses.")

    if settings.CORS_ALLOW_ALL_METHODS:
        warnings.append("CORS methods are wildcarded.")
    elif set(settings.CORS_ALLOW_METHODS) != EXPECTED_CORS_METHODS:
        warnings.append("CORS methods differ from the expected allowlist.")

    if settings.CORS_ALLOW_ALL_HEADERS:
        warnings.append("CORS headers are wildcarded.")
    elif not REQUIRED_CORS_HEADERS.issubset(set(settings.CORS_ALLOW_HEADERS)):
        warnings.append("CORS header allowlist is missing one or more required headers.")

    details.extend(failures)
    details.extend(warnings)
    status = "fail" if failures else "warn" if warnings else "pass"
    summary = (
        "CORS policy has blocking issues."
        if failures
        else "CORS policy is present but broader than recommended."
        if warnings
        else "CORS policy is explicitly restricted for the current environment."
    )
    return SecurityCheckResult(
        id="cors-policy",
        category="cors",
        title="CORS restrictions",
        status=status,
        summary=summary,
        details=details,
        evidence=evidence,
        recommended_action="Restrict origins, methods, and headers explicitly for production use." if failures or warnings else None,
    )


def _api_keys_check() -> SecurityCheckResult:
    suspicious_matches: list[str] = []
    for path in _tracked_repo_files():
        if not path.is_file() or path.suffix.lower() not in TRACKED_SOURCE_SUFFIXES:
            continue
        try:
            relative = path.relative_to(ROOT_DIR)
        except ValueError:
            continue
        relative_str = str(relative).replace("\\", "/")
        if relative_str.startswith((".git/", ".venv/", "static/", "frontend/.next/", "frontend/e2e/", "tests/")):
            continue
        if relative_str in SECRET_SCAN_ALLOWLIST:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            continue
        if re.search(r"(SECRET_KEY|API_KEY|TOKEN|PASSWORD)\s*[:=]\s*[\"'][^\"']{8,}[\"']", content):
            suspicious_matches.append(relative_str)

    details: list[str] = []
    evidence: list[str] = []
    status = "pass"

    public_env_violations = [
        env_name
        for env_name in os.environ
        if env_name.startswith("NEXT_PUBLIC_") and any(pattern in env_name for pattern in PUBLIC_SECRET_ENV_PATTERNS)
    ]
    if public_env_violations:
        status = "fail"
        details.append(f"Public env vars expose secret-like names: {', '.join(sorted(public_env_violations))}")

    if suspicious_matches:
        status = "fail"
        details.append(f"Suspicious hardcoded secret patterns found in: {', '.join(sorted(set(suspicious_matches))[:10])}")

    if settings.WHATSAPP_ENABLED and not settings.WHATSAPP_API_TOKEN:
        status = "fail"
        details.append("WhatsApp notifications are enabled but WHATSAPP_API_TOKEN is not set.")

    if settings.APP_ENV == "production" and _is_placeholder_secret(settings.SECRET_KEY):
        status = "warn" if status == "pass" else status
        details.append("SECRET_KEY still appears placeholder-like in production.")

    evidence.append("Static scan executed over tracked source files.")
    return SecurityCheckResult(
        id="api-key-handling",
        category="api_keys",
        title="API keys and secrets",
        status=status,
        summary="Secret handling has blocking issues." if status == "fail" else "Secret handling has warnings." if status == "warn" else "No obvious secret-handling issues were detected.",
        details=details,
        evidence=evidence,
        recommended_action="Move secrets to environment variables and remove hardcoded values from tracked files." if status != "pass" else None,
    )


def _unwrap_annotation(annotation: Any) -> Any:
    origin = get_origin(annotation)
    if origin is None:
        return annotation
    if str(origin).endswith("Annotated"):
        args = get_args(annotation)
        return args[0] if args else annotation
    return annotation


def _is_validated_annotation(param: Any) -> bool:
    field_info = getattr(param, "field_info", None)
    if isinstance(field_info, (Query, PathParam, Header, Form, Body)):
        return True
    annotation = _unwrap_annotation(getattr(param, "type_", None))
    if annotation is None:
        return False
    try:
        return isinstance(annotation, type) and issubclass(annotation, BaseModel)
    except TypeError:
        return False


def _server_validation_check(app: FastAPI) -> SecurityCheckResult:
    failures: list[str] = []
    inspected = 0
    for route in app.routes:
        methods = getattr(route, "methods", None)
        dependant = getattr(route, "dependant", None)
        path = getattr(route, "path", "")
        if not methods or dependant is None:
            continue
        mutating = [method for method in methods if method in {"POST", "PUT", "PATCH"}]
        if not mutating:
            continue
        if not path.startswith("/api/v1/"):
            continue
        inspected += 1
        params = list(dependant.body_params) + list(dependant.path_params) + list(dependant.query_params) + list(dependant.header_params)
        invalid = [param.name for param in params if not _is_validated_annotation(param)]
        if invalid:
            failures.append(f"{','.join(sorted(mutating))} {path}: unvalidated parameters -> {', '.join(invalid)}")

    status = "fail" if failures else "pass"
    return SecurityCheckResult(
        id="server-side-validation",
        category="server_validation",
        title="Server-side validation",
        status=status,
        summary="All inspected mutating routes use validated inputs." if not failures else "Some mutating routes accept insufficiently validated inputs.",
        details=failures or [f"Inspected mutating routes: {inspected}"],
        evidence=["Route inspection based on FastAPI dependency metadata."],
        recommended_action="Wrap mutating inputs in Pydantic models or constrained Query/Path/Header definitions." if failures else None,
    )


def _rate_limit_check() -> SecurityCheckResult:
    from app.core.rate_limit import APPLIED_RATE_LIMITS

    missing = sorted(REQUIRED_RATE_LIMITED_ROUTES - APPLIED_RATE_LIMITS)
    protected = sorted(APPLIED_RATE_LIMITS & REQUIRED_RATE_LIMITED_ROUTES)
    status = "fail" if missing else "pass"
    return SecurityCheckResult(
        id="sensitive-route-rate-limits",
        category="rate_limits",
        title="Sensitive route rate limits",
        status=status,
        summary="Required sensitive routes are rate limited." if not missing else "One or more sensitive routes are missing rate limiting.",
        details=[f"Missing protection: {route}" for route in missing] or [f"Protected routes: {len(protected)}"],
        evidence=[f"Protected route registry entries: {', '.join(protected)}"] if protected else [],
        recommended_action="Add limiter dependencies to all required auth and access routes." if missing else None,
    )


def collect_security_audit(app: FastAPI) -> SecurityAuditResponse:
    checks = [
        _rate_limit_check(),
        _row_level_security_check(),
        _server_validation_check(app),
        _api_keys_check(),
        _env_var_check(),
        _cors_check(),
        _dependency_check(),
    ]
    return SecurityAuditResponse(
        summary=_build_summary(checks),
        checks=checks,
        generated_at=datetime.now(timezone.utc),
    )
