-- Migration 0028 — canonical team linkage for system_inventory.
--
-- system_inventory.team has always been a free-text string, independent of
-- org_group (the real team hierarchy). This adds a nullable group_key column
-- so a system can be linked to the canonical org_group row. No FK constraint
-- is added deliberately (matches the loose-coupling style already used for
-- org_employee.source_manager_emp / manager_override_emp): systems may be
-- backfilled before every org_group row exists, and we don't want an ALTER
-- TABLE ... ADD CONSTRAINT to block re-running this file. Population happens
-- via migrations/0029_link_system_team_to_group.py, not here.

USE sl_people;

ALTER TABLE system_inventory ADD COLUMN group_key VARCHAR(50) NULL AFTER team;
CREATE INDEX idx_system_inventory_group_key ON system_inventory (group_key);
