-- SL IMS — Phase 1: core inventory schema.
USE sl_ims;

-- ── Category (drives tag prefix, warranty & depreciation defaults) ─────────────
CREATE TABLE IF NOT EXISTS ims_category (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(16) NOT NULL UNIQUE,
  item_kind ENUM('SERIALIZED','CONSUMABLE','LICENSE') NOT NULL DEFAULT 'SERIALIZED',
  default_warranty_months INT NULL,
  default_depreciation_rate DECIMAL(5,2) NULL,
  default_useful_life_years INT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Manufacturer (brand master) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ims_manufacturer (
  manufacturer_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vendor (supplier) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ims_vendor (
  vendor_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  contact_person VARCHAR(128) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  gstin VARCHAR(32) NULL,
  address VARCHAR(512) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Location (office / floor / room / store hierarchy) ─────────────────────────
CREATE TABLE IF NOT EXISTS ims_location (
  location_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  parent_id INT NULL,
  kind ENUM('OFFICE','FLOOR','ROOM','STORE','OTHER') NOT NULL DEFAULT 'OTHER',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ims_location_parent FOREIGN KEY (parent_id) REFERENCES ims_location(location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Product / model catalog (reusable spec sheet → autofill) ───────────────────
CREATE TABLE IF NOT EXISTS ims_product (
  product_id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  manufacturer_id INT NULL,
  model_name VARCHAR(191) NOT NULL,
  specs JSON NULL,
  default_warranty_months INT NULL,
  default_depreciation_rate DECIMAL(5,2) NULL,
  default_useful_life_years INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ims_product_category FOREIGN KEY (category_id) REFERENCES ims_category(category_id),
  CONSTRAINT fk_ims_product_manufacturer FOREIGN KEY (manufacturer_id) REFERENCES ims_manufacturer(manufacturer_id),
  INDEX ix_ims_product_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Asset (the physical unit) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ims_asset (
  asset_id INT AUTO_INCREMENT PRIMARY KEY,
  asset_tag VARCHAR(32) NOT NULL UNIQUE,
  serial_number VARCHAR(128) NULL,
  category_id INT NOT NULL,
  product_id INT NULL,
  manufacturer_id INT NULL,
  model_name VARCHAR(191) NULL,
  status ENUM('IN_STOCK','RESERVED','ASSIGNED','IN_REPAIR','RETIRED','LOST') NOT NULL DEFAULT 'IN_STOCK',
  condition_rating ENUM('NEW','GOOD','FAIR','POOR','DAMAGED') NOT NULL DEFAULT 'NEW',
  location_id INT NULL,
  assigned_person_id VARCHAR(64) NULL,
  assigned_email VARCHAR(255) NULL,
  assigned_name VARCHAR(255) NULL,
  vendor_id INT NULL,
  purchase_cost DECIMAL(12,2) NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  purchase_date DATE NULL,
  warranty_start DATE NULL,
  warranty_end DATE NULL,
  in_service_date DATE NULL,
  retirement_date DATE NULL,
  useful_life_years INT NULL,
  specs JSON NULL,
  notes TEXT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_email VARCHAR(255) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  updated_by_email VARCHAR(255) NULL,
  CONSTRAINT fk_ims_asset_category FOREIGN KEY (category_id) REFERENCES ims_category(category_id),
  CONSTRAINT fk_ims_asset_product FOREIGN KEY (product_id) REFERENCES ims_product(product_id),
  CONSTRAINT fk_ims_asset_manufacturer FOREIGN KEY (manufacturer_id) REFERENCES ims_manufacturer(manufacturer_id),
  CONSTRAINT fk_ims_asset_location FOREIGN KEY (location_id) REFERENCES ims_location(location_id),
  CONSTRAINT fk_ims_asset_vendor FOREIGN KEY (vendor_id) REFERENCES ims_vendor(vendor_id),
  INDEX ix_ims_asset_status (status),
  INDEX ix_ims_asset_category (category_id),
  INDEX ix_ims_asset_serial (serial_number),
  INDEX ix_ims_asset_assigned (assigned_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Per-category / per-FY running number for asset tags ────────────────────────
CREATE TABLE IF NOT EXISTS ims_asset_sequence (
  category_code VARCHAR(16) NOT NULL,
  fy INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (category_code, fy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
