-- L2 assessment form storage (interviewer / GL feedback)

CREATE TABLE IF NOT EXISTS rec_candidate_interview_assessment (
  candidate_interview_assessment_id INT NOT NULL AUTO_INCREMENT,
  candidate_interview_id INT NOT NULL,
  candidate_id INT NOT NULL,
  interviewer_person_id_platform VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  data_json TEXT NULL,
  created_by_person_id_platform VARCHAR(64) NULL,
  updated_by_person_id_platform VARCHAR(64) NULL,
  submitted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (candidate_interview_assessment_id),
  UNIQUE KEY uq_rec_interview_assessment_interview (candidate_interview_id),
  KEY ix_rec_interview_assessment_candidate (candidate_id),
  KEY ix_rec_interview_assessment_interviewer (interviewer_person_id_platform),
  CONSTRAINT fk_rec_interview_assessment_candidate
    FOREIGN KEY (candidate_id) REFERENCES rec_candidate(candidate_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rec_interview_assessment_interview
    FOREIGN KEY (candidate_interview_id) REFERENCES rec_candidate_interview(candidate_interview_id)
    ON DELETE CASCADE
);
