-- Adds faction_id to turn_events so faction-level events (unit_id IS NULL --
-- NAME/PASSWORD/unrecognized faction orders) can be scoped back to a faction
-- without parsing the description text. Also populated on every unit-scoped
-- event going forward (from state.unit.faction_id), not just the
-- unit_id IS NULL ones, so the Global Events report query is simply
-- `turn_events WHERE faction_id = X AND unit_id IS NULL AND turn_number = Y`.
--
-- Nullable, no backfill: rows written before this migration (e.g. the
-- existing unit_arrived test row from turn 2) legitimately have
-- faction_id = NULL and are not corrected retroactively.
--
-- Run manually via the Supabase SQL Editor (no DDL execution path available
-- to the app's REST-only Supabase client / service key).

ALTER TABLE turn_events ADD COLUMN IF NOT EXISTS faction_id uuid;
