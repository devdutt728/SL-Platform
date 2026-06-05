USE sl_people;

ALTER TABLE system_inventory ADD COLUMN `3dsmax_version` VARCHAR(100) NULL AFTER sketchup_version;
ALTER TABLE system_inventory ADD COLUMN rhino_version VARCHAR(100) NULL AFTER `3dsmax_version`;
ALTER TABLE system_inventory ADD COLUMN enscape_version VARCHAR(100) NULL AFTER rhino_version;
ALTER TABLE system_inventory ADD COLUMN d5_render VARCHAR(100) NULL AFTER enscape_version;
ALTER TABLE system_inventory ADD COLUMN antivirus VARCHAR(100) NULL AFTER office_version;
ALTER TABLE system_inventory ADD COLUMN purchase_date DATE NULL AFTER antivirus;
ALTER TABLE system_inventory ADD COLUMN vendor VARCHAR(255) NULL AFTER purchase_date;
ALTER TABLE system_inventory ADD COLUMN service_tag VARCHAR(100) NULL AFTER vendor;
ALTER TABLE system_inventory ADD COLUMN serial_no VARCHAR(100) NULL AFTER service_tag;
