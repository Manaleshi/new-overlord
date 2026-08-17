-- Real harvest-yield data for USE (harvesting), pulled from the 2010
-- engine's skills.rules source (HARVEST/PRODUCES directives), which the
-- original skill_defs migration never captured (it only pulled combat/stat
-- effects). Populated for the ~20 skills using the USING_HARVEST paradigm
-- that harvest a real, already-migrated item (excludes coin-generating and
-- internal-event-token skills under the same paradigm -- see HANDOVER.md).
--
-- harvest_item / produced_item: the item tag consumed from the location and
-- the item tag granted to the unit -- usually the same tag (horse breaking
-- consumes and produces "hrse"), sometimes different (find beasts of
-- burden consumes "catt" but produces "mule").
--
-- harvest_rate_per_level / harvest_days_per_level: parallel arrays, one
-- entry per skill level (same length as the existing level_days column).
-- Daily production per figure at a given level = rate[level] / days[level]
-- (RationalNumber(harvest_, days_) in the real HarvestUsingStrategy).
-- Confirmed from real source that BOTH the rate and the days denominator
-- can change between levels, not just the rate (e.g. gold mining doesn't
-- harvest more gold per attempt at level 2 -- it takes fewer days per
-- unit); a level with no new HARVEST/PRODUCES line in the source carries
-- the previous level's values forward unchanged (mirrors the real engine's
-- incremental parsing, confirmed against skills.rules directly, not
-- assumed).
--
-- Run manually via the Supabase SQL Editor (no DDL execution path available
-- to the app's REST-only Supabase client / service key). Data population
-- (the actual per-skill values) is a separate DML step, run via script
-- after this migration.

ALTER TABLE skill_defs ADD COLUMN IF NOT EXISTS harvest_item text;
ALTER TABLE skill_defs ADD COLUMN IF NOT EXISTS produced_item text;
ALTER TABLE skill_defs ADD COLUMN IF NOT EXISTS harvest_rate_per_level integer[];
ALTER TABLE skill_defs ADD COLUMN IF NOT EXISTS harvest_days_per_level integer[];
