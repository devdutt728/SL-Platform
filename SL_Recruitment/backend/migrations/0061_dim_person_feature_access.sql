-- Platform-side explicit feature access grants.
-- Used to manage reports visibility without depending on platform role codes.

CREATE TABLE IF NOT EXISTS dim_person_feature_access (
  person_id VARCHAR(64) NOT NULL,
  feature_code VARCHAR(64) NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by_person_id VARCHAR(64) NULL,
  PRIMARY KEY (person_id, feature_code),
  KEY idx_dim_person_feature_access_feature (feature_code),
  KEY idx_dim_person_feature_access_granted_at (granted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
