-- Tracks arrival order of units at a location, for report display ordering
-- (report18.txt shows units listed in arrival order, earliest first) and for
-- grouping stacked units correctly (leader followed by its stacked
-- followers, matching the real "Leading:" display format).
--
-- Nullable, no backfill/default: existing rows have no recorded arrival
-- order (this wasn't tracked before now) -- the report query treats NULL as
-- "arrived earliest" (sorts first) rather than guessing a value. Only new
-- writes going forward (registration, MOVE arrival, RECRUIT-created units)
-- get a real value.
--
-- Run manually via the Supabase SQL Editor (no DDL execution path available
-- to the app's REST-only Supabase client / service key).

ALTER TABLE units ADD COLUMN IF NOT EXISTS stack_position integer;
