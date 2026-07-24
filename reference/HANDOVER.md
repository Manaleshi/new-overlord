# New Overlord — Handover Document

Written to hand this project to Claude Code (or a future session of this chat)
without losing context. Read this before touching any code.

---

## 0. UPDATE — Phase 1 closed (session after original handover was written)

Everything below in this document was written before Phase 1 was actually
verified end-to-end. It has now been run successfully **three consecutive
turns** with correct results (`eventCount: 60` each time, matching expected
math for 2 units × 30 days of WORK). Registration → orders → turn processing
→ report generation → email now genuinely works. Real bugs found and fixed
along the way, worth knowing about since they could recur in similar form:

- **Production was silently broken for ~2 days.** Every deployment from
  "Turn report showing own units..." through "Stage 4a" showed `Error` in
  Vercel's Deployments list — nobody noticed because local dev worked fine
  and nothing was checking deployment status. **Lesson: check the Vercel
  Deployments tab is green after every push, don't assume it.** A large
  fraction of this session's confusion was testing against stale/broken
  production while believing fixes weren't working.
- Two real build-breaking bugs caused that: a stray extra quote in an
  import statement (`turnProcessor.ts`), and a TypeScript strict-mode error
  from comparing a jsonb `unknown`-typed value directly (`turnReport.ts`,
  `Object.entries(def.effects)` — fixed by casting to `Number()`).
- **The `orders` table insert was missing required NOT NULL columns**:
  `game_id`, `order_type`, `status`. The original insert code never checked
  for errors, so it silently failed while still sending a "success" email —
  looked like everything worked, but zero rows ever landed. Fixed by adding
  the missing fields AND adding proper error logging (`console.error` on
  every insert) so this class of bug surfaces immediately in Vercel's
  Runtime Logs next time, instead of days of confused guessing.
- **`RESEND_API_KEY` in Vercel was stale/wrong** relative to the working
  local key — fixed by overwriting it directly in Vercel's env var settings
  and redeploying. (Note: this did NOT turn out to be the root cause of the
  Yahoo-specific issue below — that persisted even after the key fix.)

### RESOLVED — Yahoo email deliverability

Was intermittently failing to deliver turn reports (long, bracket-dense
content) to a Yahoo test inbox, while short order-confirmations arrived
reliably — confirmed via clean A/B test not to be a code bug (identical
content delivered instantly to Gmail). Root cause was most likely some
combination of (a) a missing DMARC record, since fixed — added `v=DMARC1;
p=none; rua=mailto:orders@new-overlord.us` via Namecheap, after cleaning up
a duplicate `_dmarc` TXT record that briefly existed — and (b) Yahoo
building sender trust for a brand-new domain (`new-overlord.us`, ~3 days
old at the time).

**Confirmed resolved in a follow-up test**: after DMARC propagated, a fresh
order → turn → report cycle delivered the report to the Yahoo inbox
**immediately** — a genuine change from the multi-hour delay/silent-drop
behavior seen earlier the same day. Notably, several of the *earlier*
undelivered reports from that same session also arrived later, all at
once, consistent with Yahoo having queued/held them (greylisting-style
behavior) rather than dropping them outright, and releasing the backlog
once trust in the domain increased.

No further action needed here unless this recurs with a different
provider/player later — if so, check DMARC/SPF/DKIM status first (Resend →
Domains → Records tab) before assuming a code issue.

---


A faithful web recreation of "New Overlord," a 1990s Play-By-Email fantasy
strategy game (original design: Vincent Archer). PBEM-first: registration and
orders must work by email, not just a web form. Stack: Next.js + Supabase +
Vercel, deployed at `new-overlord.vercel.app`. Andy is GM and developer.
Goal: run a ~5-player playtest.

**Governing principle:** the original design is the north star. Modern
conveniences are additive. When in doubt, match the original engine's
behavior — don't invent new mechanics.

---

## 2. What's actually working right now

- World generation (50×50 hex grid, Imperial City fixed at `L0001`, all other
  location/faction/unit codes randomized to prevent map/player-count
  inference)
- NPC factions/units seeded
- Email registration (`REGISTER` → pending player) via Resend
  (`orders@new-overlord.us`)
- Email order submission (`#GAME FXXXX password` → syntax-check reply) —
  **routing bug fixed**: checks `#GAME` prefix before registration subject
  match, so replies to old threads don't get misrouted
- Order parser (`app/lib/orderParser.ts`) — handles `@`/`-`/`+`/`Dnn`/leading-
  duration-number modifiers correctly; hardened against CRLF/quoted-printable/
  BOM email mangling
- Turn processor (`app/lib/turnProcessor.ts`) — runs a real 30-day loop
- GM admin interface for assigning pending players to starting locations
- `/api/process-turn?secret=...&game=<uuid>` — triggers a full turn: runs
  registrations, day loop, generates + emails reports via the existing
  `turnReport.ts`, increments `games.turn_number`

## 3. What the turn processor currently executes (and how correctly)

Built against the real 2010 C++ engine source (see `/engine-source`), not
guessed. Confirmed-correct against source:

| Order | Status | Notes |
|---|---|---|
| NAME, PASSWORD | ✅ done | Faction-level, apply pre-day-1 |
| GUARD | ✅ done | Immediate; halves WORK output same day |
| WORK | ✅ done | Wage from `location.economics.wages`; blocked if guarding |
| STUDY | ✅ done, corrected | Implicit target = current level + 1 if no level given (never open-ended); self-study caps at level 2 (3rd+ needs TEACH, not built); cost is **per-figure**, not flat |
| MOVE | ⚠️ partial | Walking only. Reads real `location.resources.exits` (nested in jsonb `resources`, not top-level). Riding/flying capacity deferred — needs `unit_items` + `item_defs.capacity_ride/fly` wiring |
| RECRUIT, GIVE, USE, MARCH | ❌ not built | Recognized, logged as `order_pending`, left queued untouched — not silently dropped |
| Everything else in RulesNew.txt | ❌ not built | TEACH, EQUIP, SPLIT, ENTER/LEAVE, etc. |

**The conditional/alternative cascade** (`-`/`+` order chaining) was rebuilt
to match `OrderProcessor::postProcessOrder` exactly — see
`postProcessCascade()` in `turnProcessor.ts`. This was wrong in the first
draft; don't re-simplify it without re-reading `OrderProcessor.cpp`.

**Explicitly stubbed, not implemented:**
- Wages/upkeep/desertion at month-end (units don't lose figures for unpaid
  upkeep yet)
- Outlaw spawning
- Combat (units sharing a hex with hostiles currently do nothing)
- Riding/flying movement

## 4. Decisions already made — do not re-litigate without asking Andy

- Starting faction funds: **500** (placeholder, flagged `TODO` in code —
  confirm before real playtest)
- Starting leader upkeep: **5/figure** (same caveat)
- Turn trigger: **manual GET endpoint**, not cron, for now
- Skill level progression: **15/45/90/180/360 days**, assumed universal
  across all skills (not per-skill) — this is inferred from the project's
  own status notes, not yet cross-checked against `game/skills.rules` in the
  2010 archive. Worth verifying.
- Self-study caps at level 2; level 3+ requires a teacher (not yet built)

**Database gotcha, worth knowing before touching `orders` table code:** the
`orders` table has NOT NULL columns (`game_id`, `order_type`, `status`) not
obvious from a glance at insert-shaped code copied from elsewhere in the
codebase. Always check the real Supabase schema (Table Editor, or `SELECT
column_name, is_nullable FROM information_schema.columns WHERE table_name =
'orders'`) before writing a new insert, and always check `{ error }` on
every Supabase call — the original bug here was a silently-swallowed insert
failure that still let a "success" email go out.

## 5. Untested — this is the actual current blocker

**The full loop (register → assign location → submit orders → process turn →
report emailed → state correctly updated) has never been run once,
end-to-end, even against test data.** That's the single most important next
action, before any new feature work. Andy has a test world/test units set up
already; no real game/players exist yet.

---

## 6. Reference material in this bundle

```
/reference
  engine-source/
    orders/
      StudyOrder.cpp, StudyOrder.h    — confirmed against; corrections applied
      MoveOrder.cpp, MoveOrder.h      — confirmed against; MOVE walk logic matches
      WorkOrder.cpp, WorkOrder.h      — confirmed against; minor notes only
    processing/
      OrderProcessor.cpp   — the single-pass day loop + conditional cascade logic
      OrderLine.cpp        — order field semantics (@,-,+,D,duration), confirms
                              orderParser.ts's field mapping is correct
  game-archive/
    report18.txt   — a REAL report from an actual archived playthrough.
                      Ground truth for report format/wording. Confirms e.g.
                      "Faction fund: $X ($Y reward this turn)" monthly bonus,
                      and "lent $X for upkeep" auto-cover mechanic.
    report46.txt    — checked specifically to determine whether the game
                      ended at turn 46 or 47: INCONCLUSIVE. This report is
                      completely ordinary (normal deadline for turn 47's
                      orders, normal order-template footer) — the game was
                      still active after turn 46. Whether it ended at 47 or
                      continued further and this player's local archive
                      simply stops here is unknown. Not worth chasing
                      further; doesn't block anything. Also useful as a
                      real COMBAT report sample (see Unit [75541]'s death
                      in battle, turn 46) for Phase 4.

    CORRECTION — an earlier draft of this doc called the ewelin archive a
    "regression test suite" implying real orders could be replayed through
    our turn processor and diffed against her real reports. That's not
    actually possible: her orders reference her specific game's world
    (map L70 "Daanar", her faction's 46-turn unit/skill history, specific
    NPC faction codes) — our world is procedurally regenerated with
    different randomized codes every time, so there's no way to reproduce
    matching state to diff against. What the archive IS genuinely useful
    for:
      - Feeding real orders*.txt files through orderParser.ts as parsing
        fixtures (catches real syntax our parser doesn't handle — this
        doesn't depend on matching world state)
      - Extracting specific numbers from real reports (wage rates, study
        costs confirmed per-figure, upkeep amounts) as known-good test
        cases for individual functions in turnProcessor.ts
      - Report wording/structure as a template for turnReport.ts, which is
        independent of world state
    This is NOT a drop-in integration test; it needs someone to extract
    fixtures deliberately, order by order.
  knowledge-base/
    spells_base.txt          — the main spell/skill list (121 tags, 6 schools)
    magic_fire/void/water/air/earth/magecraft.txt
                              — per-school files; NOT pure duplicates of
                                spells_base.txt — 14 tags exist ONLY here.
                                See magic_skills_consolidated.md in project
                                knowledge for the merged version.
  inventories/
    2010_engine_full_inventory.txt   — full file listing of the entire 2010
                                        C++ engine (1,133 files). Use this to
                                        find anything not yet pulled — full
                                        combat engine (66 files), full report
                                        generator (34 files), 67 order types
                                        total (only 3 pulled so far), rules
                                        data files (skills.rules, items.rules,
                                        races.rules, combat_*.var, etc.)
    player_archive_inventory.txt     — listing of a real player's full
                                        46-turn game archive (orders+reports
                                        for turns 1-46), useful for further
                                        format validation
```

**Also already in project knowledge (not duplicated in this bundle):**
`RulesNew.txt` (rules), `overlord_source_catalog.md` (full catalog of both
archives with a suggested pull order by phase), `magic_skills_consolidated.txt`
(merged spell list), `New_Overlord_Project_Status.md`.

**Not yet pulled, but known to exist and mapped in the catalog** — the two
highest-value items for the next two phases:
- `engine/report/TurnReport.cpp` + `engine/report_patterns.txt` — the real
  report generator source, for validating/rebuilding `turnReport.ts`
- `engine/CombatDesign.txt` + `engine/combat/BasicCombatEngine.cpp` +
  `CombatManager.cpp` — combat engine design doc + core implementation

---

## 7. Suggested phase roadmap (Phase 1 now complete — see section 0)

1. ~~Close the loop~~ — **DONE.** Verified three consecutive turns, correct
   math, real email delivery (Gmail confirmed; Yahoo pending DMARC
   propagation re-test).
2. **Regression-test against real playthrough data** — validate order
   parsing and mechanic formulas against real archived data (see corrected
   note in section 6, not a literal replay)
3. **Real data pass** — cross-check `skill_defs`/`item_defs` against
   `game/skills.rules`/`items.rules` from the 2010 archive
4. **Minimum viable combat** — a small playtest will produce hex collisions
   with Outlaws/wolves almost immediately; this can't stay a no-op long
5. **Fill out order set** — RECRUIT, GIVE, USE, then TEACH (unlocks 3rd+
   skill levels)
6. **Playtest readiness** — real starting funds/upkeep numbers, GM admin dry
   run, then actually recruit 5 people

**Standing practice from here on, given tonight's deployment confusion:**
after every push, check Vercel's Deployments tab is green before assuming a
fix is live. It cost most of tonight's session to discover production had
been silently broken for ~2 days.

---

## 8. If handing this to Claude Code specifically

Suggested first instruction to give it: **"Read this handover doc and
`/reference` in full before making any changes. Do not implement wages/
upkeep, combat, or any order beyond what's marked ✅ done above without
checking with Andy first — those involve game-design numbers he hasn't set
yet, not just code."** Then point it at item 1 above (the end-to-end test
run) as the actual first task — it's verification, not new feature work, and
it'll surface real bugs before anything else gets built on a shaky
foundation.
