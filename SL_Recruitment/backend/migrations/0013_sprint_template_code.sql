-- Add unique sprint template code

ALTER TABLE rec_sprint_template
  ADD COLUMN IF NOT EXISTS sprint_template_code VARCHAR(64) NULL
    AFTER sprint_template_id;

DROP INDEX IF EXISTS uk_rec_sprint_template_code ON rec_sprint_template;
CREATE UNIQUE INDEX uk_rec_sprint_template_code
  ON rec_sprint_template (sprint_template_code);
