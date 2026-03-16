-- PostgreSQL-only migration bundle for automatic dim_person.person_code generation.
-- This bundle is separate from the existing MySQL migrations in ../migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dim_person (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    worker_type text NULL,
    principal_flag boolean NOT NULL DEFAULT false,
    date_of_joining date NULL,
    reserved_person_code text NULL,
    special_digit_root smallint NULL,
    person_code text NULL,
    employment_status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_dim_person_worker_type
        CHECK (worker_type IS NULL OR upper(worker_type) IN ('EMPLOYEE', 'INTERN', 'CONTRACT')),
    CONSTRAINT chk_dim_person_special_digit_root
        CHECK (special_digit_root IS NULL OR special_digit_root BETWEEN 1 AND 9),
    CONSTRAINT chk_dim_person_person_code_shape
        CHECK (person_code IS NULL OR upper(person_code) ~ '^(SL|SLI|SLC)[0-9]{3,}$'),
    CONSTRAINT chk_dim_person_reserved_person_code_shape
        CHECK (reserved_person_code IS NULL OR upper(reserved_person_code) ~ '^(SL|SLI|SLC)[0-9]{3,}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dim_person_person_code
    ON dim_person (upper(person_code))
    WHERE person_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dim_person_reserved_person_code
    ON dim_person (upper(reserved_person_code))
    WHERE reserved_person_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dim_person_backfill_order
    ON dim_person (principal_flag DESC, date_of_joining ASC, id ASC);

CREATE TABLE IF NOT EXISTS person_code_counters (
    code_type text PRIMARY KEY,
    next_seq integer NOT NULL,
    min_seq integer NOT NULL,
    max_seq integer NULL,
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_person_code_counters_code_type
        CHECK (code_type IN ('PRINCIPAL', 'EMPLOYEE', 'INTERN', 'CONTRACT')),
    CONSTRAINT chk_person_code_counters_bounds
        CHECK (
            min_seq > 0
            AND next_seq >= min_seq
            AND (max_seq IS NULL OR max_seq >= min_seq)
        )
);

INSERT INTO person_code_counters (code_type, next_seq, min_seq, max_seq)
VALUES
    ('PRINCIPAL', 1, 1, 10),
    ('EMPLOYEE', 11, 11, NULL),
    ('INTERN', 1, 1, NULL),
    ('CONTRACT', 1, 1, NULL)
ON CONFLICT (code_type) DO NOTHING;
