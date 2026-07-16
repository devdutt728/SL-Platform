-- SL IMS — Phases 5-6: finance ledger, budgets, alerts, and saved dashboard views.
USE sl_ims;

CREATE TABLE IF NOT EXISTS ims_budget (
  budget_id INT AUTO_INCREMENT PRIMARY KEY,
  fy INT NOT NULL,
  category_id INT NULL,
  planned_amount DECIMAL(14,2) NOT NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_budget_category FOREIGN KEY (category_id) REFERENCES ims_category(category_id),
  UNIQUE KEY uq_ims_budget_fy_category (fy, category_id),
  INDEX ix_ims_budget_fy (fy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_cost_event (
  cost_event_id INT AUTO_INCREMENT PRIMARY KEY,
  fy INT NOT NULL,
  month INT NOT NULL,
  cost_type ENUM('PURCHASE','REPAIR','LICENSE_RENEWAL','DISPOSAL','CONSUMABLE') NOT NULL,
  source ENUM('ACTUAL','FORECAST') NOT NULL DEFAULT 'ACTUAL',
  category_id INT NULL,
  asset_id INT NULL,
  license_id INT NULL,
  purchase_id INT NULL,
  repair_id INT NULL,
  consumable_id INT NULL,
  vendor_id INT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  event_date DATE NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ims_cost_category FOREIGN KEY (category_id) REFERENCES ims_category(category_id),
  CONSTRAINT fk_ims_cost_asset FOREIGN KEY (asset_id) REFERENCES ims_asset(asset_id),
  CONSTRAINT fk_ims_cost_license FOREIGN KEY (license_id) REFERENCES ims_license(license_id),
  CONSTRAINT fk_ims_cost_purchase FOREIGN KEY (purchase_id) REFERENCES ims_purchase(purchase_id),
  CONSTRAINT fk_ims_cost_repair FOREIGN KEY (repair_id) REFERENCES ims_repair(repair_id),
  CONSTRAINT fk_ims_cost_consumable FOREIGN KEY (consumable_id) REFERENCES ims_consumable(consumable_id),
  CONSTRAINT fk_ims_cost_vendor FOREIGN KEY (vendor_id) REFERENCES ims_vendor(vendor_id),
  INDEX ix_ims_cost_fy_month (fy, month),
  INDEX ix_ims_cost_type_source (cost_type, source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_alert (
  alert_id INT AUTO_INCREMENT PRIMARY KEY,
  alert_type ENUM('WARRANTY_EXPIRY','LICENSE_RENEWAL','LOW_STOCK','REPAIR_OVERDUE','PENDING_RETURN','DATA_GAP') NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  due_date DATE NULL,
  status ENUM('OPEN','ACKNOWLEDGED','RESOLVED') NOT NULL DEFAULT 'OPEN',
  severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  metadata_json JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  resolved_at DATETIME(6) NULL,
  INDEX ix_ims_alert_status_due (status, due_date),
  INDEX ix_ims_alert_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_dashboard_view (
  view_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  scope VARCHAR(64) NOT NULL DEFAULT 'EXECUTIVE',
  filters JSON NULL,
  created_by_email VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_ims_dashboard_scope (scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
