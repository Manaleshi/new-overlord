-- Tracks unpaid-upkeep state for the dissent/desertion mechanic
-- (RulesNew.txt, "Upkeep"): a unit that misses its monthly upkeep payment
-- acquires a dissent effect; if it misses a second time while still
-- dissenting, it deserts. false/default = no missed payment on record (or
-- payment successfully caught back up); true = missed last month, one more
-- missed payment away from desertion.
--
-- Not null, defaults false: every existing unit is assumed to have no
-- missed-payment history, since upkeep has never actually been debited
-- before this column existed (previously stubbed -- see HANDOVER.md
-- section -6/-8).
--
-- Run manually via the Supabase SQL Editor (no DDL execution path available
-- to the app's REST-only Supabase client / service key).

ALTER TABLE units ADD COLUMN IF NOT EXISTS dissent boolean NOT NULL DEFAULT false;
