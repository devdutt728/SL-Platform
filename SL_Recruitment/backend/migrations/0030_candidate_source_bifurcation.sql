ALTER TABLE rec_candidate
  ADD COLUMN source_origin VARCHAR(32) NOT NULL DEFAULT 'ui' AFTER source_channel,
  ADD COLUMN external_source_ref VARCHAR(191) NULL AFTER source_origin;

CREATE INDEX idx_rec_candidate_source_origin ON rec_candidate (source_origin);
CREATE INDEX idx_rec_candidate_external_source_ref ON rec_candidate (external_source_ref);
