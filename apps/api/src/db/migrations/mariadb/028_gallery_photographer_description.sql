-- Migration 028: gallery primary photographer + markdown description
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS primary_photographer_id VARCHAR(32) NULL DEFAULT NULL
  AFTER author_email;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS description_md TEXT NULL DEFAULT NULL
  AFTER description;

ALTER TABLE galleries
  ADD CONSTRAINT fk_galleries_primary_photographer
    FOREIGN KEY (primary_photographer_id) REFERENCES photographers(id) ON DELETE SET NULL;
