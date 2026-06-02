-- Table 16 — system_inventory
-- PC/workstation inventory. From the Systems sheet. composite_score and
-- capability_tier are computed via gradePc_ (CPU*0.32 + GPU*0.40 + RAM*0.28).

USE sl_people;

CREATE TABLE IF NOT EXISTS system_inventory (
  id                 CHAR(36)      NOT NULL,
  system_id          VARCHAR(30)   NOT NULL,
  system_type        VARCHAR(30)   NULL,  -- Desktop | Laptop
  assigned_email     VARCHAR(255)  NULL,
  user_display       VARCHAR(100)  NULL,
  team               VARCHAR(100)  NULL,
  processor          VARCHAR(255)  NULL,
  ram_gb             DECIMAL(6,1)  NULL,
  ram_slots_free     VARCHAR(30)   NULL,
  graphics_card      VARCHAR(255)  NULL,
  cpu_cores          VARCHAR(50)   NULL,
  storage            TEXT          NULL,
  motherboard        VARCHAR(255)  NULL,
  os                 VARCHAR(100)  NULL,
  autocad_version    VARCHAR(100)  NULL,
  sketchup_version   VARCHAR(100)  NULL,
  adobe_versions     TEXT          NULL,
  office_version     VARCHAR(100)  NULL,
  composite_score    INT           NULL,  -- 0-100
  capability_tier    VARCHAR(30)   NULL,  -- Workstation | Performance | Standard | Basic | Entry
  upgrade_suggestion TEXT          NULL,
  status             VARCHAR(30)   NOT NULL DEFAULT 'Active',  -- Active | Retired | Faulty | In Repair
  notes              TEXT          NULL,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_system_inventory_sysid (system_id),
  KEY idx_system_inventory_email (assigned_email),
  KEY idx_system_inventory_tier (capability_tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
