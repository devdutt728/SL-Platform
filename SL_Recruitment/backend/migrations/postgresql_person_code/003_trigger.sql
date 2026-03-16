-- PostgreSQL-only migration bundle for automatic dim_person.person_code generation.

CREATE OR REPLACE FUNCTION trg_dim_person_assign_person_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_code_type text;
BEGIN
    NEW.full_name := btrim(NEW.full_name);
    NEW.worker_type := NULLIF(upper(btrim(NEW.worker_type)), '');
    NEW.employment_status := COALESCE(NULLIF(upper(btrim(NEW.employment_status)), ''), 'ACTIVE');
    NEW.person_code := NULLIF(upper(btrim(NEW.person_code)), '');
    NEW.reserved_person_code := NULLIF(upper(btrim(NEW.reserved_person_code)), '');

    IF NEW.full_name IS NULL OR NEW.full_name = '' THEN
        RAISE EXCEPTION 'full_name is required';
    END IF;

    IF NEW.worker_type IS NOT NULL AND NEW.worker_type NOT IN ('EMPLOYEE', 'INTERN', 'CONTRACT') THEN
        RAISE EXCEPTION 'worker_type must be EMPLOYEE, INTERN, or CONTRACT';
    END IF;

    IF NEW.special_digit_root IS NOT NULL AND NEW.special_digit_root NOT BETWEEN 1 AND 9 THEN
        RAISE EXCEPTION 'special_digit_root must be between 1 and 9';
    END IF;

    resolved_code_type := CASE
        WHEN COALESCE(NEW.principal_flag, false) THEN 'PRINCIPAL'
        WHEN NEW.worker_type = 'INTERN' THEN 'INTERN'
        WHEN NEW.worker_type = 'CONTRACT' THEN 'CONTRACT'
        ELSE 'EMPLOYEE'
    END;

    IF NEW.reserved_person_code IS NOT NULL
       AND NOT person_code_is_valid_for_type(resolved_code_type, NEW.reserved_person_code) THEN
        RAISE EXCEPTION
            'reserved_person_code % is invalid for inferred code_type %',
            NEW.reserved_person_code,
            resolved_code_type;
    END IF;

    IF NEW.person_code IS NULL THEN
        NEW.person_code := generate_person_code(
            resolved_code_type,
            NEW.reserved_person_code,
            NEW.special_digit_root
        );
    ELSE
        IF NOT person_code_is_valid_for_type(resolved_code_type, NEW.person_code) THEN
            RAISE EXCEPTION
                'person_code % is invalid for inferred code_type %',
                NEW.person_code,
                resolved_code_type;
        END IF;

        IF NEW.reserved_person_code IS NOT NULL AND NEW.person_code <> NEW.reserved_person_code THEN
            RAISE EXCEPTION
                'person_code % must match reserved_person_code % when both are provided',
                NEW.person_code,
                NEW.reserved_person_code;
        END IF;

        IF NEW.special_digit_root IS NOT NULL AND digit_root(NEW.person_code) <> NEW.special_digit_root THEN
            RAISE EXCEPTION
                'person_code % does not satisfy special_digit_root %',
                NEW.person_code,
                NEW.special_digit_root;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_at := COALESCE(NEW.created_at, now());
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dim_person_assign_person_code_biud ON dim_person;

CREATE TRIGGER dim_person_assign_person_code_biud
BEFORE INSERT OR UPDATE ON dim_person
FOR EACH ROW
EXECUTE FUNCTION trg_dim_person_assign_person_code();
