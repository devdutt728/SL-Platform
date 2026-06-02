-- Table 17 — peripheral_inventory
-- Projectors, printers, peripherals. From the Peripherals sheet.

USE sl_people;

CREATE TABLE IF NOT EXISTS peripheral_inventory (
  id          CHAR(36)     NOT NULL,
  item_id     VARCHAR(30)  NOT NULL,
  category    VARCHAR(100) NULL,  -- Projector | Printer | UPS | ...
  item        TEXT         NOT NULL,
  model       VARCHAR(255) NULL,
  serial      VARCHAR(100) NULL,
  quantity    INT          NOT NULL DEFAULT 1,
  `condition` VARCHAR(50)  NULL,  -- Good | Faulty | In Repair
  location    VARCHAR(255) NULL,
  assigned_to VARCHAR(255) NULL,
  status      VARCHAR(50)  NOT NULL DEFAULT 'Active',  -- Active | Faulty | Retired | Disposed
  notes       TEXT         NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_peripheral_item_id (item_id),
  KEY idx_peripheral_category (category),
  KEY idx_peripheral_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
