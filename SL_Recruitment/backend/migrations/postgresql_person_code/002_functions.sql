-- PostgreSQL-only migration bundle for automatic dim_person.person_code generation.

CREATE OR REPLACE FUNCTION normalize_person_code_type(code_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized text := upper(btrim(code_type));
BEGIN
    IF normalized IS NULL OR normalized = '' THEN
        RAISE EXCEPTION 'code_type is required';
    END IF;

    IF normalized NOT IN ('PRINCIPAL', 'EMPLOYEE', 'INTERN', 'CONTRACT') THEN
        RAISE EXCEPTION 'Unsupported code_type: %', code_type;
    END IF;

    RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION person_code_seq(input_code text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    digits text := regexp_replace(upper(btrim(coalesce(input_code, ''))), '\D', '', 'g');
BEGIN
    IF digits = '' THEN
        RETURN NULL;
    END IF;

    RETURN digits::integer;
END;
$$;

CREATE OR REPLACE FUNCTION person_code_is_valid_for_type(code_type text, input_code text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized_type text := normalize_person_code_type(code_type);
    normalized_code text := upper(btrim(coalesce(input_code, '')));
    seq integer := person_code_seq(normalized_code);
BEGIN
    IF normalized_code = '' OR seq IS NULL THEN
        RETURN false;
    END IF;

    CASE normalized_type
        WHEN 'PRINCIPAL' THEN
            RETURN normalized_code ~ '^SL[0-9]{3,}$' AND seq BETWEEN 1 AND 10;
        WHEN 'EMPLOYEE' THEN
            RETURN normalized_code ~ '^SL[0-9]{3,}$' AND seq >= 11;
        WHEN 'INTERN' THEN
            RETURN normalized_code ~ '^SLI[0-9]{3,}$' AND seq >= 1;
        WHEN 'CONTRACT' THEN
            RETURN normalized_code ~ '^SLC[0-9]{3,}$' AND seq >= 1;
        ELSE
            RETURN false;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION digit_root(input_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    digits text := regexp_replace(coalesce(input_text, ''), '\D', '', 'g');
    running_total integer;
    idx integer;
BEGIN
    IF digits = '' THEN
        RETURN NULL;
    END IF;

    LOOP
        running_total := 0;

        FOR idx IN 1 .. length(digits) LOOP
            running_total := running_total + substr(digits, idx, 1)::integer;
        END LOOP;

        EXIT WHEN running_total < 10;
        digits := running_total::text;
    END LOOP;

    RETURN running_total;
END;
$$;

CREATE OR REPLACE FUNCTION format_seq(seq integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
    IF seq < 1 THEN
        RAISE EXCEPTION 'Sequence must be positive: %', seq;
    END IF;

    RETURN lpad(seq::text, greatest(3, length(seq::text)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION format_person_code(code_type text, seq integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    normalized_type text := normalize_person_code_type(code_type);
BEGIN
    CASE normalized_type
        WHEN 'PRINCIPAL' THEN
            IF seq NOT BETWEEN 1 AND 10 THEN
                RAISE EXCEPTION 'Principal sequence % is outside the allowed SL001-SL010 range', seq;
            END IF;
            RETURN 'SL' || format_seq(seq);
        WHEN 'EMPLOYEE' THEN
            IF seq < 11 THEN
                RAISE EXCEPTION 'Employee sequence must start at 11, got %', seq;
            END IF;
            RETURN 'SL' || format_seq(seq);
        WHEN 'INTERN' THEN
            RETURN 'SLI' || format_seq(seq);
        WHEN 'CONTRACT' THEN
            RETURN 'SLC' || format_seq(seq);
        ELSE
            RAISE EXCEPTION 'Unsupported code_type: %', code_type;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION next_seq(code_type text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    normalized_type text := normalize_person_code_type(code_type);
    assigned_seq integer;
BEGIN
    UPDATE person_code_counters
    SET next_seq = next_seq + 1,
        updated_at = now()
    WHERE person_code_counters.code_type = normalized_type
      AND (person_code_counters.max_seq IS NULL OR person_code_counters.next_seq <= person_code_counters.max_seq)
    RETURNING person_code_counters.next_seq - 1 INTO assigned_seq;

    IF assigned_seq IS NULL THEN
        IF EXISTS (
            SELECT 1
            FROM person_code_counters
            WHERE person_code_counters.code_type = normalized_type
        ) THEN
            RAISE EXCEPTION 'No remaining sequence values for code_type %', normalized_type;
        END IF;

        RAISE EXCEPTION 'Counter row missing for code_type %', normalized_type;
    END IF;

    RETURN assigned_seq;
END;
$$;

CREATE OR REPLACE FUNCTION generate_person_code(
    code_type text,
    reserved_code text DEFAULT NULL,
    desired_root integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    normalized_type text := normalize_person_code_type(code_type);
    normalized_reserved text := NULLIF(upper(btrim(reserved_code)), '');
    seq integer;
    candidate text;
BEGIN
    IF desired_root IS NOT NULL AND desired_root NOT BETWEEN 1 AND 9 THEN
        RAISE EXCEPTION 'desired_root must be between 1 and 9, got %', desired_root;
    END IF;

    PERFORM 1
    FROM person_code_counters
    WHERE person_code_counters.code_type = normalized_type
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter row missing for code_type %', normalized_type;
    END IF;

    IF normalized_reserved IS NOT NULL THEN
        IF NOT person_code_is_valid_for_type(normalized_type, normalized_reserved) THEN
            RAISE EXCEPTION 'Reserved person_code % is invalid for code_type %', normalized_reserved, normalized_type;
        END IF;

        IF desired_root IS NOT NULL AND digit_root(normalized_reserved) <> desired_root THEN
            RAISE EXCEPTION
                'Reserved person_code % does not satisfy desired digit root %',
                normalized_reserved,
                desired_root;
        END IF;

        PERFORM 1
        FROM dim_person
        WHERE upper(person_code) = normalized_reserved;

        IF FOUND THEN
            RAISE EXCEPTION 'Reserved person_code % is already in use', normalized_reserved;
        END IF;

        RETURN normalized_reserved;
    END IF;

    LOOP
        seq := next_seq(normalized_type);
        candidate := format_person_code(normalized_type, seq);

        PERFORM 1
        FROM dim_person
        WHERE upper(person_code) = candidate;

        IF FOUND THEN
            CONTINUE;
        END IF;

        IF desired_root IS NOT NULL AND digit_root(candidate) <> desired_root THEN
            CONTINUE;
        END IF;

        RETURN candidate;
    END LOOP;
END;
$$;
