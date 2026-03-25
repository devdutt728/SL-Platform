-- Database-level guards for recruitment candidate codes.
-- Purpose:
-- 1) allocate a valid code if rec_candidate is inserted without one
-- 2) reject direct inserts that try to use an unreserved / invalid code
-- 3) prevent candidate_code edits after creation
-- 4) release candidate codes automatically when a candidate row is deleted

DROP TRIGGER IF EXISTS trg_rec_candidate_before_insert_code_guard;
DROP TRIGGER IF EXISTS trg_rec_candidate_after_insert_code_assign;
DROP TRIGGER IF EXISTS trg_rec_candidate_before_update_code_guard;
DROP TRIGGER IF EXISTS trg_rec_candidate_after_delete_code_release;

DELIMITER $$

CREATE TRIGGER trg_rec_candidate_before_insert_code_guard
BEFORE INSERT ON rec_candidate
FOR EACH ROW
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_seq INT;
  DECLARE v_next_seq INT;
  DECLARE v_registry_state VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE v_registry_candidate_id INT;

  SET v_now = CURRENT_TIMESTAMP;
  SET NEW.candidate_code = NULLIF(UPPER(TRIM(COALESCE(NEW.candidate_code, ''))), '');

  INSERT IGNORE INTO rec_candidate_code_counter (counter_key, next_sequence, created_at, updated_at)
  VALUES ('default', 1, v_now, v_now);

  IF NEW.candidate_code IS NULL THEN
    SELECT sequence_no
      INTO v_seq
    FROM rec_candidate_code_registry
    WHERE state = 'released'
    ORDER BY sequence_no ASC
    LIMIT 1
    FOR UPDATE;

    IF v_seq IS NOT NULL THEN
      SET NEW.candidate_code = CONCAT('SLR-', LPAD(v_seq, 4, '0'));
      UPDATE rec_candidate_code_registry
      SET state = 'reserved',
          candidate_id = NULL,
          reserved_at = v_now,
          assigned_at = NULL,
          released_at = NULL,
          updated_at = v_now
      WHERE sequence_no = v_seq;
    ELSE
      SELECT next_sequence
        INTO v_next_seq
      FROM rec_candidate_code_counter
      WHERE counter_key = 'default'
      LIMIT 1
      FOR UPDATE;

      SET v_seq = GREATEST(COALESCE(v_next_seq, 1), 1);
      SET NEW.candidate_code = CONCAT('SLR-', LPAD(v_seq, 4, '0'));

      INSERT INTO rec_candidate_code_registry (
        sequence_no,
        candidate_code,
        candidate_id,
        state,
        reserved_at,
        assigned_at,
        released_at,
        created_at,
        updated_at
      ) VALUES (
        v_seq,
        NEW.candidate_code,
        NULL,
        'reserved',
        v_now,
        NULL,
        NULL,
        v_now,
        v_now
      )
      ON DUPLICATE KEY UPDATE
        state = 'reserved',
        candidate_id = NULL,
        reserved_at = v_now,
        assigned_at = NULL,
        released_at = NULL,
        updated_at = v_now;

      UPDATE rec_candidate_code_counter
      SET next_sequence = GREATEST(COALESCE(next_sequence, 1), v_seq + 1),
          updated_at = v_now
      WHERE counter_key = 'default';
    END IF;
  ELSE
    IF NEW.candidate_code NOT REGEXP '^SLR-[0-9]{4,}$' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid candidate_code format. Expected SLR-0001 or higher.';
    END IF;

    SELECT state, candidate_id
      INTO v_registry_state, v_registry_candidate_id
    FROM rec_candidate_code_registry
    WHERE candidate_code = (NEW.candidate_code COLLATE utf8mb4_0900_ai_ci)
    LIMIT 1
    FOR UPDATE;

    IF v_registry_state IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'candidate_code must be allocated by the registry before insert.';
    END IF;

    IF v_registry_state <> ('reserved' COLLATE utf8mb4_0900_ai_ci) OR v_registry_candidate_id IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'candidate_code is not available for assignment.';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_rec_candidate_after_insert_code_assign
AFTER INSERT ON rec_candidate
FOR EACH ROW
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_seq INT;

  SET v_now = CURRENT_TIMESTAMP;
  SET v_seq = CAST(SUBSTRING(NEW.candidate_code, 5) AS UNSIGNED);

  INSERT IGNORE INTO rec_candidate_code_counter (counter_key, next_sequence, created_at, updated_at)
  VALUES ('default', 1, v_now, v_now);

  INSERT INTO rec_candidate_code_registry (
    sequence_no,
    candidate_code,
    candidate_id,
    state,
    reserved_at,
    assigned_at,
    released_at,
    created_at,
    updated_at
  ) VALUES (
    v_seq,
    NEW.candidate_code,
    NEW.candidate_id,
    'assigned',
    NULL,
    v_now,
    NULL,
    v_now,
    v_now
  )
  ON DUPLICATE KEY UPDATE
    candidate_id = NEW.candidate_id,
    state = 'assigned',
    reserved_at = NULL,
    assigned_at = COALESCE(assigned_at, v_now),
    released_at = NULL,
    updated_at = v_now;

  UPDATE rec_candidate_code_counter
  SET next_sequence = GREATEST(COALESCE(next_sequence, 1), v_seq + 1),
      updated_at = v_now
  WHERE counter_key = 'default';
END$$

CREATE TRIGGER trg_rec_candidate_before_update_code_guard
BEFORE UPDATE ON rec_candidate
FOR EACH ROW
BEGIN
  SET NEW.candidate_code = UPPER(TRIM(COALESCE(NEW.candidate_code, '')));

  IF NEW.candidate_code <> UPPER(TRIM(COALESCE(OLD.candidate_code, ''))) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'candidate_code is immutable and cannot be changed directly.';
  END IF;
END$$

CREATE TRIGGER trg_rec_candidate_after_delete_code_release
AFTER DELETE ON rec_candidate
FOR EACH ROW
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_seq INT;

  SET v_now = CURRENT_TIMESTAMP;

  IF OLD.candidate_code IS NOT NULL AND UPPER(TRIM(OLD.candidate_code)) REGEXP '^SLR-[0-9]{4,}$' THEN
    SET v_seq = CAST(SUBSTRING(UPPER(TRIM(OLD.candidate_code)), 5) AS UNSIGNED);

    INSERT INTO rec_candidate_code_registry (
      sequence_no,
      candidate_code,
      candidate_id,
      state,
      reserved_at,
      assigned_at,
      released_at,
      created_at,
      updated_at
    ) VALUES (
      v_seq,
      UPPER(TRIM(OLD.candidate_code)),
      NULL,
      'released',
      NULL,
      NULL,
      v_now,
      v_now,
      v_now
    )
    ON DUPLICATE KEY UPDATE
      candidate_id = NULL,
      state = 'released',
      reserved_at = NULL,
      assigned_at = NULL,
      released_at = v_now,
      updated_at = v_now;

    INSERT IGNORE INTO rec_candidate_code_counter (counter_key, next_sequence, created_at, updated_at)
    VALUES ('default', 1, v_now, v_now);

    UPDATE rec_candidate_code_counter
    SET next_sequence = GREATEST(COALESCE(next_sequence, 1), v_seq + 1),
        updated_at = v_now
    WHERE counter_key = 'default';
  END IF;
END$$

DELIMITER ;
