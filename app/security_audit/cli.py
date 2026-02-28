from __future__ import annotations

import json
import os
from pathlib import Path

from app.main import app
from app.security_audit import collect_security_audit


def main() -> int:
    report = collect_security_audit(app)
    output_path = Path("reports") / "security-audit.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")
    print(json.dumps(report.model_dump(mode="json"), indent=2))
    strict = os.getenv("SECURITY_AUDIT_STRICT", "0") == "1"
    return 1 if strict and report.summary.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
