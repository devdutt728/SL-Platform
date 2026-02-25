ALTER TABLE rec_candidate_offer
  ADD COLUMN IF NOT EXISTS approval_principal_email VARCHAR(191) NULL AFTER approved_at,
  ADD COLUMN IF NOT EXISTS approval_requested_by_email VARCHAR(191) NULL AFTER approval_principal_email,
  ADD COLUMN IF NOT EXISTS approval_requested_at DATETIME NULL AFTER approval_requested_by_email,
  ADD COLUMN IF NOT EXISTS approval_request_token CHAR(64) NULL AFTER approval_requested_at,
  ADD COLUMN IF NOT EXISTS approval_request_expires_at DATETIME NULL AFTER approval_request_token,
  ADD COLUMN IF NOT EXISTS approval_request_used_at DATETIME NULL AFTER approval_request_expires_at,
  ADD COLUMN IF NOT EXISTS approval_decision VARCHAR(20) NULL AFTER approval_request_used_at,
  ADD COLUMN IF NOT EXISTS approval_decision_by_email VARCHAR(191) NULL AFTER approval_decision,
  ADD COLUMN IF NOT EXISTS approval_decision_at DATETIME NULL AFTER approval_decision_by_email,
  ADD COLUMN IF NOT EXISTS approval_rejection_reason TEXT NULL AFTER approval_decision_at,
  ADD COLUMN IF NOT EXISTS acceptance_typed_name VARCHAR(191) NULL AFTER declined_at,
  ADD COLUMN IF NOT EXISTS acceptance_ip VARCHAR(64) NULL AFTER acceptance_typed_name,
  ADD COLUMN IF NOT EXISTS acceptance_user_agent VARCHAR(512) NULL AFTER acceptance_ip;

DROP INDEX IF EXISTS idx_rec_candidate_offer_approval_token ON rec_candidate_offer;
CREATE INDEX idx_rec_candidate_offer_approval_token
  ON rec_candidate_offer (approval_request_token);
