-- Add offer letter override JSON for appointment letter variables
ALTER TABLE rec_candidate_offer
ADD COLUMN IF NOT EXISTS offer_letter_overrides TEXT NULL
AFTER notes_internal;

