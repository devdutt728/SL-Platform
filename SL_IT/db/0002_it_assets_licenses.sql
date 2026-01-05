CREATE TABLE it_vendor (
  vendor_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  website VARCHAR(255),
  support_email VARCHAR(255),
  support_phone VARCHAR(64),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE it_asset (
  asset_id INT AUTO_INCREMENT PRIMARY KEY,
  asset_tag VARCHAR(64) NOT NULL,
  asset_type ENUM('LAPTOP','DESKTOP','SERVER','MOBILE','PERIPHERAL','OTHER') NOT NULL,
  serial_number VARCHAR(128),
  manufacturer VARCHAR(128),
  model VARCHAR(128),
  operating_system VARCHAR(128),
  purchase_date DATE,
  warranty_end DATE,
  assigned_person_id VARCHAR(64),
  assigned_email VARCHAR(255),
  assigned_name VARCHAR(255),
  status ENUM('ACTIVE','IN_STOCK','IN_REPAIR','RETIRED','LOST','STOLEN') NOT NULL DEFAULT 'IN_STOCK',
  location VARCHAR(128),
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_it_asset_tag (asset_tag),
  UNIQUE KEY uq_it_asset_serial (serial_number)
);

CREATE TABLE it_license (
  license_id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT,
  name VARCHAR(128) NOT NULL,
  sku VARCHAR(128),
  license_type ENUM('SUBSCRIPTION','PERPETUAL','CONCURRENT','NAMED_USER','DEVICE') NOT NULL,
  total_seats INT NOT NULL DEFAULT 1,
  contract_start DATE,
  contract_end DATE,
  renewal_date DATE,
  cost_amount DECIMAL(12,2),
  cost_currency VARCHAR(16),
  billing_cycle ENUM('MONTHLY','ANNUAL','ONE_TIME'),
  registered_email VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_it_license_vendor (vendor_id),
  CONSTRAINT fk_it_license_vendor FOREIGN KEY (vendor_id) REFERENCES it_vendor(vendor_id)
);

CREATE TABLE it_license_assignment (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY,
  license_id INT NOT NULL,
  asset_id INT,
  assigned_person_id VARCHAR(64),
  assigned_email VARCHAR(255),
  assigned_name VARCHAR(255),
  assigned_at DATETIME(6),
  unassigned_at DATETIME(6),
  status ENUM('ACTIVE','REVOKED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_it_license_assignment_license (license_id),
  KEY idx_it_license_assignment_asset (asset_id),
  KEY idx_it_license_assignment_person (assigned_person_id),
  CONSTRAINT fk_it_license_assignment_license FOREIGN KEY (license_id) REFERENCES it_license(license_id),
  CONSTRAINT fk_it_license_assignment_asset FOREIGN KEY (asset_id) REFERENCES it_asset(asset_id)
);

CREATE TABLE it_license_attachment (
  attachment_id INT AUTO_INCREMENT PRIMARY KEY,
  license_id INT NOT NULL,
  filename VARCHAR(256) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL,
  storage_type ENUM('drive','local','url') NOT NULL,
  storage_ref VARCHAR(512) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_it_license_attachment_license (license_id),
  CONSTRAINT fk_it_license_attachment_license FOREIGN KEY (license_id) REFERENCES it_license(license_id)
);

CREATE TABLE it_credential (
  credential_id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(128) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password_cipher VARBINARY(4096) NOT NULL,
  password_nonce VARBINARY(32) NOT NULL,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_rotated_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE it_license_credential (
  license_id INT NOT NULL,
  credential_id INT NOT NULL,
  PRIMARY KEY (license_id, credential_id),
  CONSTRAINT fk_it_license_credential_license FOREIGN KEY (license_id) REFERENCES it_license(license_id),
  CONSTRAINT fk_it_license_credential_credential FOREIGN KEY (credential_id) REFERENCES it_credential(credential_id)
);
  