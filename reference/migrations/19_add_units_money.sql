-- Adds per-unit cash, distinct from faction funds, matching the real engine's
-- unit->hasMoney() concept (RecruitRequest.cpp, NewRecruitRequest.cpp,
-- MarketRequest.cpp all check only the issuing unit's own money -- never
-- faction funds automatically). Starts at 0 for every unit; only ever
-- populated by WITHDRAW (faction funds -> unit money) for now. WORK/STUDY
-- are deliberately left untouched (still pay into faction.funds directly) --
-- confirmed with Andy as the intended scope, not a bigger WORK-funding
-- overhaul to route wages into unit money like the real engine ultimately
-- does.
--
-- Run manually via the Supabase SQL Editor (no DDL execution path available
-- to the app's REST-only Supabase client / service key).

ALTER TABLE units ADD COLUMN IF NOT EXISTS money integer NOT NULL DEFAULT 0;
