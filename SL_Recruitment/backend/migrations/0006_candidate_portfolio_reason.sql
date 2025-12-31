-- Store reason when a portfolio is not uploaded (MySQL)

ALTER TABLE rec_candidate
  ADD COLUMN IF NOT EXISTS portfolio_not_uploaded_reason TEXT NULL;

