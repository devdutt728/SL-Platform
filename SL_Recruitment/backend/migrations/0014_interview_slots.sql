-- Interview slot proposals (candidate self-scheduling)

CREATE TABLE IF NOT EXISTS rec_candidate_interview_slot (
  candidate_interview_slot_id INT NOT NULL AUTO_INCREMENT,

  candidate_id INT NOT NULL,
  round_type VARCHAR(50) NOT NULL,

  interviewer_person_id_platform INT NULL,
  interviewer_email VARCHAR(255) NULL,

  slot_start_at DATETIME NOT NULL,
  slot_end_at DATETIME NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'proposed',
  selection_token VARCHAR(64) NOT NULL,
  batch_id VARCHAR(64) NULL,

  booked_interview_id INT NULL,
  expires_at DATETIME NULL,

  created_by_person_id_platform INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (candidate_interview_slot_id),
  UNIQUE KEY uq_rec_candidate_interview_slot_token (selection_token),

  KEY ix_rec_candidate_interview_slot_candidate (candidate_id),
  KEY ix_rec_candidate_interview_slot_interviewer (interviewer_person_id_platform),
  KEY ix_rec_candidate_interview_slot_batch (batch_id),
  KEY ix_rec_candidate_interview_slot_status (status),

  CONSTRAINT fk_rec_candidate_interview_slot_candidate
    FOREIGN KEY (candidate_id) REFERENCES rec_candidate(candidate_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_rec_candidate_interview_slot_interview
    FOREIGN KEY (booked_interview_id) REFERENCES rec_candidate_interview(candidate_interview_id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE rec_candidate_interview_slot
  MODIFY candidate_id INT NOT NULL,
  MODIFY booked_interview_id INT NULL;
