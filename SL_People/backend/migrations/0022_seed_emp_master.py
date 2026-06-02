"""Seed employee_ext + all HR sub-tables from `Emp Master.xlsx`.

Phase 0 status: STRUCTURE ONLY.

The full row-by-row ingestion is implemented in the Import phase (it shares the
same upsert engine as POST /ppl/import/apply). This stub fixes the contract so the
later implementation drops in without rework. It documents the transform rules
from SL_PEOPLE_PLAN.md §12 and wires the ported helpers + Fernet encryption.

Transform rules (plan §12 / §6 "0022"):
  1. Skip rows 1-2; row 3 is the header row.
  2. Skip the dummy employee (first_name == 'Dummy').
  3. Normalise employee number: SL0XXX kept as-is; integer-format legacy IDs
     become 'LEGACY-NNN' with the original stored in legacy_number.
  4. Link to dim_person via person_code == employee_number (LEFT join — NULL ok
     for the 417 exited / 170 legacy records with no platform account).
  5. Resolve reporting_manager_id by employee_number lookup; 'Not Available' -> NULL.
  6. Encrypt PAN (col 60, fall back to col 72) and Aadhaar via Fernet before insert.
  7. Upsert all 7 per-employee sub-tables in one transaction per employee
     (ON DUPLICATE KEY UPDATE — MySQL equivalent of the plan's ON CONFLICT).

Usage (once implemented + Emp Master.xlsx is in place):
    python -m migrations.0022_seed_emp_master --file "../../Org Data (1).xlsx"
"""

from __future__ import annotations

import re

# Ported helpers available to the implementation:
# from app.services.console_logic import level_for, compute_experience
# from app.services.encryption import encrypt
# from app.models.people import EmployeeExt, EmployeeHr, EmployeeAddress, ...


def normalise_employee_number(raw: str) -> tuple[str, str | None]:
    """Return (employee_number, legacy_number).

    SL0XXX values pass through unchanged with legacy_number = None.
    Pure-integer legacy IDs become 'LEGACY-<int>' with the original preserved.
    """
    value = str(raw or "").strip()
    if re.fullmatch(r"SL\d+", value, flags=re.IGNORECASE):
        return value.upper(), None
    if re.fullmatch(r"\d+", value):
        return f"LEGACY-{int(value)}", value
    return value, None


def resolve_pan(col60: str | None, col72: str | None) -> str | None:
    """Prefer col 60 PAN; fall back to col 72 (duplicate column) when col 60 is empty."""
    primary = str(col60 or "").strip()
    if primary:
        return primary
    fallback = str(col72 or "").strip()
    return fallback or None


def main() -> None:  # pragma: no cover - implemented in the Import phase
    raise NotImplementedError(
        "0022_seed_emp_master is a Phase 0 structural stub. The ingestion is built "
        "in the Import phase against the confirmed Emp Master.xlsx layout."
    )


if __name__ == "__main__":
    main()
