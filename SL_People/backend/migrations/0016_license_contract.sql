-- Table 15 — license_contract
-- Software license inventory. From the License_Inventory sheet.

USE sl_people;

CREATE TABLE IF NOT EXISTS license_contract (
  id            CHAR(36)      NOT NULL,
  contract_key  VARCHAR(50)   NOT NULL,
  entity        VARCHAR(255)  NULL,
  software      VARCHAR(255)  NOT NULL,
  short_name    VARCHAR(100)  NULL,
  category      VARCHAR(100)  NULL,
  contract_no   VARCHAR(100)  NULL,
  contract_type VARCHAR(50)   NULL,  -- Subscription | Perpetual
  serial_no     VARCHAR(100)  NULL,
  seats         INT           NOT NULL DEFAULT 0,
  vendor        VARCHAR(255)  NULL,
  start_date    DATE          NULL,
  end_date      DATE          NULL,
  cost          DECIMAL(10,2) NULL,
  currency      VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status        VARCHAR(50)   NULL,  -- Active | Expired | Expiring Soon
  user_type     VARCHAR(50)   NULL,
  notes         TEXT          NULL,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_license_contract_key (contract_key),
  KEY idx_license_contract_software (software),
  KEY idx_license_contract_end (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
