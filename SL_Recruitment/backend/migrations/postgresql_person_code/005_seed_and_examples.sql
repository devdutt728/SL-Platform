-- PostgreSQL-only migration bundle for automatic dim_person.person_code generation.
-- Business seed: Devdutt Kumar should get a digit root of 1.

WITH devdutt_target AS (
    SELECT id
    FROM dim_person
    WHERE upper(btrim(full_name)) = 'DEVDUTT KUMAR'
      AND COALESCE(principal_flag, false) = false
      AND COALESCE(upper(btrim(worker_type)), 'EMPLOYEE') = 'EMPLOYEE'
      AND (person_code IS NULL OR btrim(person_code) = '')
    ORDER BY date_of_joining ASC NULLS LAST, id ASC
    LIMIT 1
),
sl343_taken AS (
    SELECT EXISTS (
        SELECT 1
        FROM dim_person
        WHERE upper(person_code) = 'SL343'
           OR upper(reserved_person_code) = 'SL343'
    ) AS taken
)
UPDATE dim_person person
SET reserved_person_code = CASE
        WHEN NOT sl343_taken.taken THEN 'SL343'
        ELSE NULL
    END,
    special_digit_root = CASE
        WHEN sl343_taken.taken THEN 1
        ELSE NULL
    END,
    updated_at = now()
FROM devdutt_target, sl343_taken
WHERE person.id = devdutt_target.id;

CALL backfill_dim_person_person_codes();

-- Example inserts:
-- INSERT INTO dim_person (full_name, worker_type, principal_flag, date_of_joining)
-- VALUES ('Principal Example', 'EMPLOYEE', true, DATE '2026-01-01');
--
-- INSERT INTO dim_person (full_name, worker_type, date_of_joining)
-- VALUES ('Employee Example', 'EMPLOYEE', DATE '2026-01-02');
--
-- INSERT INTO dim_person (full_name, worker_type, special_digit_root, date_of_joining)
-- VALUES ('Employee Root One', 'EMPLOYEE', 1, DATE '2026-01-03');
--
-- INSERT INTO dim_person (full_name, worker_type, reserved_person_code, date_of_joining)
-- VALUES ('Intern Reserved', 'INTERN', 'SLI108', DATE '2026-01-04');
--
-- INSERT INTO dim_person (full_name, worker_type, date_of_joining)
-- VALUES ('Contract Example', 'CONTRACT', DATE '2026-01-05');
--
-- Example validation query:
-- SELECT
--     full_name,
--     worker_type,
--     principal_flag,
--     reserved_person_code,
--     special_digit_root,
--     person_code,
--     digit_root(person_code) AS person_code_digit_root
-- FROM dim_person
-- ORDER BY principal_flag DESC, date_of_joining ASC NULLS LAST, id ASC;
