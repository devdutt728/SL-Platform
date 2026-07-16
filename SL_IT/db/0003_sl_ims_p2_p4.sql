-- SL IMS — Phases 2-4: allotment, repairs, purchases, Drive attachments,
-- licenses, and consumables.
USE sl_ims;

CREATE TABLE IF NOT EXISTS ims_asset_assignment (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  action ENUM('CHECKOUT','CHECKIN','TRANSFER') NOT NULL,
  person_id VARCHAR(64) NULL,
  person_email VARCHAR(255) NULL,
  person_name VARCHAR(255) NULL,
  from_location_id INT NULL,
  to_location_id INT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  returned_at DATETIME(6) NULL,
  condition_out VARCHAR(32) NULL,
  condition_in VARCHAR(32) NULL,
  handover_doc_url VARCHAR(1024) NULL,
  acknowledged_at DATETIME(6) NULL,
  notes TEXT NULL,
  created_by_email VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ims_assignment_asset FOREIGN KEY (asset_id) REFERENCES ims_asset(asset_id),
  CONSTRAINT fk_ims_assignment_from_location FOREIGN KEY (from_location_id) REFERENCES ims_location(location_id),
  CONSTRAINT fk_ims_assignment_to_location FOREIGN KEY (to_location_id) REFERENCES ims_location(location_id),
  INDEX ix_ims_assignment_asset (asset_id),
  INDEX ix_ims_assignment_person (person_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_purchase (
  purchase_id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NULL,
  invoice_number VARCHAR(128) NULL,
  invoice_date DATE NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  subtotal DECIMAL(12,2) NULL,
  tax DECIMAL(12,2) NULL,
  total DECIMAL(12,2) NULL,
  drive_folder_id VARCHAR(255) NULL,
  invoice_file_url VARCHAR(1024) NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_purchase_vendor FOREIGN KEY (vendor_id) REFERENCES ims_vendor(vendor_id),
  INDEX ix_ims_purchase_invoice (invoice_number),
  INDEX ix_ims_purchase_date (invoice_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_purchase_line (
  purchase_line_id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  asset_id INT NULL,
  category_id INT NULL,
  description VARCHAR(255) NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost DECIMAL(12,2) NULL,
  total_cost DECIMAL(12,2) NULL,
  CONSTRAINT fk_ims_purchase_line_purchase FOREIGN KEY (purchase_id) REFERENCES ims_purchase(purchase_id),
  CONSTRAINT fk_ims_purchase_line_asset FOREIGN KEY (asset_id) REFERENCES ims_asset(asset_id),
  CONSTRAINT fk_ims_purchase_line_category FOREIGN KEY (category_id) REFERENCES ims_category(category_id),
  INDEX ix_ims_purchase_line_purchase (purchase_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_repair (
  repair_id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  reported_fault TEXT NOT NULL,
  reported_by_person_id VARCHAR(64) NULL,
  reported_by_email VARCHAR(255) NULL,
  reported_by_name VARCHAR(255) NULL,
  vendor_id INT NULL,
  sent_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expected_return_at DATETIME(6) NULL,
  returned_at DATETIME(6) NULL,
  status ENUM('SENT','IN_PROGRESS','RETURNED','CANCELLED') NOT NULL DEFAULT 'SENT',
  outcome ENUM('REPAIRED','REPLACED','BER','NO_FAULT','CANCELLED') NULL,
  warranty_covered TINYINT(1) NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(12,2) NULL,
  final_cost DECIMAL(12,2) NULL,
  parts_replaced TEXT NULL,
  loaner_asset_id INT NULL,
  drive_folder_id VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  updated_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_repair_asset FOREIGN KEY (asset_id) REFERENCES ims_asset(asset_id),
  CONSTRAINT fk_ims_repair_loaner FOREIGN KEY (loaner_asset_id) REFERENCES ims_asset(asset_id),
  CONSTRAINT fk_ims_repair_vendor FOREIGN KEY (vendor_id) REFERENCES ims_vendor(vendor_id),
  INDEX ix_ims_repair_asset (asset_id),
  INDEX ix_ims_repair_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_license (
  license_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  vendor_id INT NULL,
  license_type VARCHAR(64) NULL,
  billing_cycle ENUM('MONTHLY','QUARTERLY','ANNUAL','ONE_TIME') NOT NULL DEFAULT 'ANNUAL',
  total_seats INT NOT NULL DEFAULT 1,
  cost DECIMAL(12,2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  renewal_date DATE NULL,
  registered_email VARCHAR(255) NULL,
  drive_folder_id VARCHAR(255) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_license_vendor FOREIGN KEY (vendor_id) REFERENCES ims_vendor(vendor_id),
  INDEX ix_ims_license_renewal (renewal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_license_seat (
  seat_id INT AUTO_INCREMENT PRIMARY KEY,
  license_id INT NOT NULL,
  person_id VARCHAR(64) NULL,
  person_email VARCHAR(255) NULL,
  person_name VARCHAR(255) NULL,
  asset_id INT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  released_at DATETIME(6) NULL,
  notes TEXT NULL,
  created_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_license_seat_license FOREIGN KEY (license_id) REFERENCES ims_license(license_id),
  CONSTRAINT fk_ims_license_seat_asset FOREIGN KEY (asset_id) REFERENCES ims_asset(asset_id),
  INDEX ix_ims_license_seat_license (license_id),
  INDEX ix_ims_license_seat_person (person_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_consumable (
  consumable_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  category_id INT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT 'pcs',
  current_qty INT NOT NULL DEFAULT 0,
  min_qty INT NOT NULL DEFAULT 0,
  location_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_consumable_category FOREIGN KEY (category_id) REFERENCES ims_category(category_id),
  CONSTRAINT fk_ims_consumable_location FOREIGN KEY (location_id) REFERENCES ims_location(location_id),
  INDEX ix_ims_consumable_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_consumable_txn (
  txn_id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  direction ENUM('IN','OUT','ADJUST') NOT NULL,
  qty INT NOT NULL,
  person_id VARCHAR(64) NULL,
  person_email VARCHAR(255) NULL,
  person_name VARCHAR(255) NULL,
  reference VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_consumable_txn_consumable FOREIGN KEY (consumable_id) REFERENCES ims_consumable(consumable_id),
  INDEX ix_ims_consumable_txn_consumable (consumable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_attachment (
  attachment_id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(64) NOT NULL,
  entity_id INT NOT NULL,
  kind ENUM('INVOICE','WARRANTY','PHOTO','HANDOVER','LICENSE','JOB_SHEET','QUOTE','OTHER') NOT NULL DEFAULT 'OTHER',
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(128) NULL,
  drive_file_id VARCHAR(255) NULL,
  web_view_link VARCHAR(1024) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  INDEX ix_ims_attachment_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ims_drive_folder (
  folder_path VARCHAR(512) PRIMARY KEY,
  drive_folder_id VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
