-- Store the latest offer document payload for auto-populating the form.
-- MySQL < 8.0.29 does not support ADD COLUMN IF NOT EXISTS.
ALTER TABLE rec_candidate_offer
  ADD COLUMN offer_doc_payload TEXT NULL;
