-- Migration 0021 — supplementary indexes.
--
-- Primary-key, unique, foreign-key, and the per-table secondary indexes called
-- out in the plan are all created inline in 0002-0020. This file is reserved for
-- additional composite/covering indexes added as query patterns are finalised in
-- later phases (e.g. employee directory search, groups-overview aggregation).
--
-- Intentionally empty for Phase 0.

USE sl_people;
