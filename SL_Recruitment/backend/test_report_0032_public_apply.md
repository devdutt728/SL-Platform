# Recruitment QA Report: Migration 0032 + Public Apply

- Timestamp (UTC): `2026-02-20T10:13:11.777585Z`
- Scope: `backend/migrations/0032_seed_designation_openings_devdutt.sql`, `app/api/routes/public_apply.py`
- Environment: Live backend at `http://127.0.0.1:8002`, MySQL reachable

## Executive Summary

- Seed integrity checks: **10/10 PASS**
- Public apply API checks: **9/9 PASS**
- Migration idempotency dry-run (transaction rollback): **total inserts = 0**
- Duplicate seeded titles found: **0**
- Unit tests: **17/17 PASS** (`python -m unittest discover -s tests -v`)
- Note: seeded openings are treated as **standard opening creations baseline**, not ad-hoc headcount requests by Devdutt.

## Seed Integrity Results

| Title | Expected Code | Status | Issues |
| --- | --- | --- | --- |
| Group Leader | GRPL-829955 | PASS | - |
| Associate | ASSO-82996A | PASS | - |
| Project Designer | PRDS-82997A | PASS | - |
| Sr. Architect | SRAR-829986 | PASS | - |
| Sr. Designer | SRDS-829990 | PASS | - |
| Architect | ARCH-82999A | PASS | - |
| Interior Designer | INDS-8299A4 | PASS | - |
| Communications Intern | CMIN-8299B0 | PASS | - |
| Intern | INTR-8299B8 | PASS | - |
| Others | OTHR-8299BF | PASS | - |

## Migration Idempotency (Rollback Dry-Run)

- Executed migration statements: `True`
- Total rows that would be inserted if committed: `0`
- Error: `None`

| Statement # | Rowcount |
| --- | --- |
| 1 | 0 |
| 2 | 0 |
| 3 | 0 |
| 4 | 0 |
| 5 | 0 |
| 6 | 0 |
| 7 | 0 |
| 8 | 0 |
| 9 | 0 |
| 10 | 0 |

## Public Apply API Results

| Test | Status | Actual | Expected |
| --- | --- | --- | --- |
| GET /apply returns 200 | PASS | 200 | 200 |
| Public openings include all 10 seeded codes | PASS | "all present" | "all 10 present" |
| GET /apply/GRPL-829955 active prefill | PASS | 200 | 200 |
| GET /apply/NOPE-000000 unknown code | PASS | 404 | 404 |
| POST /apply missing Idempotency-Key | PASS | {"status": 400, "detail": "Missing Idempotency-Key header."} | {"status": 400, "detail_contains": "Idempotency-Key"} |
| POST /apply portfolio mandatory | PASS | {"status": 400, "detail": "Portfolio is mandatory. Upload a portfolio or provide a valid URL."} | {"status": 400, "detail_contains": "Portfolio is mandatory"} |
| POST /apply requires first+last name | PASS | {"status": 400, "detail": "First name and last name are required."} | {"status": 400, "detail_contains": "First name and last name are required"} |
| POST /apply consent mandatory | PASS | {"status": 400, "detail": "Please accept the recruitment data consent terms."} | {"status": 400, "detail_contains": "consent"} |
| POST /apply years_of_experience numeric validation | PASS | {"status": 400, "detail": "Years of experience must be a number."} | {"status": 400, "detail_contains": "Years of experience must be a number"} |

## Blockers / Not Covered

- Internal endpoints under `/rec/*` were not fully tested for role behavior because this environment requires Google bearer auth; unauthenticated requests returned `401`.
- Positive `POST /apply/{opening_code}` (candidate creation) was intentionally not executed to avoid Drive folder creation, document upload, and email side effects in shared environment.

## Evidence Files

- `test_report_0032_public_apply.json`
- `test_report_0032_public_apply.md`
