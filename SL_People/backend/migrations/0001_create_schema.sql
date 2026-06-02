-- SL_People — schema bootstrap (MySQL/InnoDB).
-- In MySQL a "schema" is a database. sl_people is its own database on the same
-- server as sl_platform; cross-database joins to sl_platform.dim_person are
-- read-only (keyed on dim_person.person_code = employee_ext.employee_number).
--
-- Run all migrations against this database. The application connects with
-- SPL_DATABASE_URL pointing at sl_people and SPL_PLATFORM_DATABASE_URL at sl_platform.

CREATE DATABASE IF NOT EXISTS sl_people
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE sl_people;
