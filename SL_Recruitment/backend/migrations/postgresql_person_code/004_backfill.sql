-- PostgreSQL-only migration bundle for automatic dim_person.person_code generation.

CREATE OR REPLACE PROCEDURE sync_person_code_counters_from_dim_person()
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE person_code_counters counter_row
    SET next_seq = GREATEST(
            counter_row.min_seq,
            COALESCE(
                (
                    SELECT MAX(person_code_seq(person.person_code)) + 1
                    FROM dim_person person
                    WHERE person.person_code IS NOT NULL
                      AND person_code_is_valid_for_type(counter_row.code_type, person.person_code)
                ),
                counter_row.min_seq
            )
        ),
        updated_at = now();
END;
$$;

CREATE OR REPLACE PROCEDURE backfill_dim_person_person_codes()
LANGUAGE plpgsql
AS $$
DECLARE
    person_row RECORD;
    resolved_code_type text;
BEGIN
    CALL sync_person_code_counters_from_dim_person();

    FOR person_row IN
        SELECT
            id,
            principal_flag,
            worker_type,
            reserved_person_code,
            special_digit_root
        FROM dim_person
        WHERE person_code IS NULL OR btrim(person_code) = ''
        ORDER BY principal_flag DESC, date_of_joining ASC NULLS LAST, id ASC
    LOOP
        resolved_code_type := CASE
            WHEN COALESCE(person_row.principal_flag, false) THEN 'PRINCIPAL'
            WHEN upper(coalesce(person_row.worker_type, '')) = 'INTERN' THEN 'INTERN'
            WHEN upper(coalesce(person_row.worker_type, '')) = 'CONTRACT' THEN 'CONTRACT'
            ELSE 'EMPLOYEE'
        END;

        UPDATE dim_person
        SET person_code = generate_person_code(
                resolved_code_type,
                reserved_person_code,
                special_digit_root
            ),
            updated_at = now()
        WHERE id = person_row.id;
    END LOOP;
END;
$$;
