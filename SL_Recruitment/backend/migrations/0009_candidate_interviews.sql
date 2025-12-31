-- Interview scheduling + feedback (L2/L1/HR rounds)

CREATE TABLE IF NOT EXISTS rec_candidate_interview (
  candidate_interview_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  candidate_id INT UNSIGNED NOT NULL,
  round_type VARCHAR(50) NOT NULL,
  interviewer_person_id_platform VARCHAR(64) NULL,
  scheduled_start_at DATETIME NOT NULL,
  scheduled_end_at DATETIME NOT NULL,
  location VARCHAR(200) NULL,
  meeting_link VARCHAR(500) NULL,
  calendar_event_id VARCHAR(128) NULL,
  feedback_submitted TINYINT(1) NOT NULL DEFAULT 0,
  rating_overall TINYINT NULL,
  rating_technical TINYINT NULL,
  rating_culture_fit TINYINT NULL,
  rating_communication TINYINT NULL,
  decision VARCHAR(20) NULL,
  notes_internal TEXT NULL,
  notes_for_candidate TEXT NULL,
  created_by_person_id_platform VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_interview_id),
  KEY ix_rec_candidate_interview_candidate (candidate_id),
  KEY ix_rec_candidate_interview_interviewer (interviewer_person_id_platform),
  KEY ix_rec_candidate_interview_scheduled (scheduled_start_at),
  KEY ix_rec_candidate_interview_feedback (feedback_submitted),
  KEY ix_rec_candidate_interview_decision (decision),
  CONSTRAINT fk_rec_candidate_interview_candidate
    FOREIGN KEY (candidate_id) REFERENCES rec_candidate(candidate_id)
    ON DELETE CASCADE
);
