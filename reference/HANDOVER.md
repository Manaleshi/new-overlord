# New Overlord — Handover Document

Written to hand this project to Claude Code (or a future session of this chat)
without losing context. Read this before touching any code.

---

## -6. UPDATE — Default WORK, stacked-unit report grouping, arrival-order tracking (eighth session, Claude Code)

### Real feature built: default WORK for units with no orders
Confirmed in `RulesNew.txt` in two places before implementing anything:
the Money/Earning section ("the WORK order, which is also the default,
i.e. all your orders lists end up with an invisible WORK") and WORK's own
order entry ("This is the default order"). Applied in `turnProcessor.ts`
whenever a unit's real order queue is exhausted — from the start of the
turn, or after other real orders complete partway through it, not just
brand-new units — gated to `leader`/`follower` unit types only (WORK is
explicitly "Leader/follower only" in the rules; creature-type units don't
get this default). **Verified**: a unit with an empty queue from turn
start showed `Day 1 - works, earning N coins`; a unit whose real orders
(`WITHDRAW` + two `RECRUIT`) completed on day 1 correctly showed WORK
picking up from `Day 2` onward.

**Real, significant consequence, discussed and deliberately kept as-is**:
this applies to every leader/follower unit in the game, which includes
NPC factions — confirmed live: 689 of 692 `turn_events` in the verification
turn were NPC/player `unit_work`, across 3 factions. **NPC factions will
now accumulate wage income every turn with no offsetting upkeep cost**,
since wages/upkeep/desertion are still stubbed. Andy's call: leave it
universal (correct per the rules; scoping it to player factions only would
be a deviation to undo later) — this is a known consequence of upkeep
being unbuilt, same category as every other missing bookkeeping mechanic
(see "What's real and open" below). The fix for the funds-accumulation
concern is building upkeep, not restricting WORK's default.

### Real feature built: stacked-unit report grouping
Format confirmed directly against `report18.txt` before implementing:
a stack leader's line ends with `" Leading:"`, followed by its stacked
follower(s) as indented lines beneath (e.g. `"The Emperor [1], ... Leading:
- Imperial Archers [203], ..."`). `turnReport.ts` now groups both "Your
units" and "Also present" by `stack_leader_id`, falling back to standalone
display if a follower's leader isn't present/visible in the same list
(defensive — a genuinely-stacked unit shouldn't silently vanish just
because its leader is hidden or elsewhere). **Verified**: `MoveTester
[U3483] - 1 leader Leading:` followed by its three stacked followers,
indented, in the actual delivered email.

**Real finding, flagged before it caused confusion**: the NPC pairs that
motivated this task (Guard Captain/Imperial Guard, Merchant/Caravan
Guards) are **not** actually linked via `stack_leader_id` in the data —
both show `is_stacked: false` on direct query. They're independent units
that happen to share a faction and location, not a real stack. This is a
gap in NPC seeding (`seedNPCFactions.ts`/`seedNPCUnits.ts` never assign
stacking relationships), not a report-rendering bug — the grouping logic
is correct and works for any unit that's genuinely stacked (confirmed on
`U5328`), it just can't group data that was never linked. **Still open**:
NPC seeding needs real stack relationships assigned before "Also present"
will ever show those specific examples grouped.

### Real feature built: arrival-order tracking
New `units.stack_position` column (migration `20_add_units_stack_position.sql`
— note: this column did **not** actually exist despite being described as
if it did; confirmed by querying before writing any code against it, not
assumed). Set to `1` on registration, appended (running max + 1 at that
location) on MOVE arrival, and the same for RECRUIT-created new units — the
last one is an extension beyond the two originally-specified cases (only
registration and MOVE were asked for), added because a unit "arriving" via
recruitment is the same conceptual event; flagged explicitly rather than
silently scope-creeping. Existing (pre-feature) units have `stack_position:
null`, treated as "arrived earliest" (sorts first) in the report query,
since there's no way to know their real historical arrival order
retroactively. **Verified**: two units recruited in the same turn showed
`stack_position: 1` and `2` respectively, in creation order, and rendered
in that order in the actual delivered email, with the legacy null-position
unit sorting first as designed.

### Standing lesson, applied correctly this time
Committed and pushed **before** testing against production this session
(the previous session's mistake — testing against undeployed code — was
fresh enough to actively avoid). Confirmed Vercel green before each
production trigger.

## -5. UPDATE — RECRUIT and WITHDRAW implemented, confirmed against real source (sixth/seventh session, Claude Code)

### Real feature built: RECRUIT and WITHDRAW, both confirmed against real 2010 engine source before writing any code
Pulled and read in full (saved to `reference/engine-source/`): `RecruitOrder.cpp/.h`,
`RecruitRequest.cpp/.h`, `NewRecruitRequest.cpp/.h`, `MarketRequest.cpp/.h`,
`LocalMarketRequest.cpp/.h`, `WithdrawOrder.cpp/.h` — plus the relevant
`RulesNew.txt` sections (Money/Upkeep, Recruiting, Market, WITHDRAW order).

**Real finding, corrects an earlier placeholder decision**: `RECRUIT` was
sitting in `turnProcessor.ts`'s `FULL_DAY_COMMANDS` set from before real
source existed for it. The real engine's `RecruitOrder` is `IMMEDIATE_ORDER`,
not full-day — it just has one narrow side effect, "the leader will not be
able to move during the day he recruits" (`RulesNew.txt`), which is now
enforced directly (a `state.recruitedToday` flag blocks that day's `MOVE`
from beginning) rather than by treating the whole order as full-day.
Reclassifying it this way also meant our *existing* immediate-order retry
mechanism (a `FAILURE` result just leaves the order queued for next day,
unmodified) already gave correct day-by-day partial-fulfillment retry for
free — confirmed against `completeOrderProcessing`'s actual control flow:
the `0 = "as much as possible"` shortcut never writes back to the order's
stored amount, so its completion check is always `0 > result` (never true)
→ always resolves once and completes; only an explicit non-zero amount
retries for the remainder.

**Real finding, resolves a money-model question directly**: units now have
their own money (`units.money`, migration `19_add_units_money.sql`),
distinct from faction funds — confirmed necessary because `RecruitRequest`/
`NewRecruitRequest`/`MarketRequest` all check only `unit_->hasMoney()`,
never faction funds. Checked `RulesNew.txt`'s `WITHDRAW` section directly to
resolve *how* faction funds ever reach a unit: **automatic fallback applies
to STUDY and UPKEEP only** ("the unit must use the WITHDRAW order to first
obtain the coin" for recruiting/market purchases — not automatic like
upkeep's peer-lending chain). `WORK`/`STUDY` deliberately left paying into
`faction.funds` directly, unchanged — Andy's call, not a wider WORK-funding
overhaul to route wages into unit money like the real engine ultimately
does.

**WITHDRAW**: immediate, capped transfer from `faction.funds` to
`units.money`. Real engine gates on `terrain == "city"`; our schema has no
such terrain (`terrain_type` is natural terrain only — plains/forest/hills/
etc.). The real signal is `resources.population_center.type`. Andy's call:
both `'city'` and `'imperial'` qualify.

**RECRUIT can create a brand-new unit**, stacked beneath the recruiting
leader — this is the first code to actually *use* the `units.is_stacked`/
`stack_leader_id` columns, which existed in the schema already but nothing
had ever read or written them before now (corrects an overstatement in
section -4's "unstacks to move" note, which implied stacking was entirely
unbuilt — the columns are now real and populated, just not the full stacking
*behavior*: move-together, weight/capacity pooling, "unstacks to move"
notification, etc. are all still unbuilt).

### Real bug caught immediately: tested against production without deploying first
First verification attempt showed `eventCount: 30`, all reading `"RECRUIT
not yet implemented"` — the code had never been committed/pushed, so
production was still running pre-session code (same *symptom* as the
Turbopack dev-cache incident in section -4, different *cause* this time —
plain forgot to deploy, not a caching bug). Caught immediately by reading
the actual event content instead of trusting the response shape (`ok: true`
looked fine). Fixed by committing (`28e18ba`), pushing, confirming Vercel
green, then re-running — the two stale orders had never been consumed
(matching the `FAILURE`-retries-forever-until-fixed design), so they carried
forward automatically and processed correctly once the real code was live.
**Standing lesson, same family as "check Vercel is green after every push"**:
commit and push *before* testing against production, not after — testing
against production is only meaningful against what's actually deployed.

### Verified, real production, real delivered email (Resend API, `last_event: "delivered"`)
`WITHDRAW 100` → faction funds `500→400`, unit money `0→100`. `RECRUIT U0000
5 man 0` → local price resolved (`$13`), unit money `100→35`, new unit
`U5328` created with 5 followers (real race-derived stats from `race_defs`:
`life: 3`, `upkeep_per_figure: 10`), recruit pool depleted `1676→1671` and
persisted (doesn't silently refill next turn). Email correctly showed both
action lines, the new unit as its own full report section, and its own
order template for the next turn. **The test world (`Alpha`) now has a real
second unit (`U5328`) as a lasting side effect of this verification** — fine,
it's the test world, not a real game.

### Known simplifications, deliberately scoped rather than silently cut — real open follow-ups
- **A new unit created via RECRUIT can't receive orders in the same
  submission yet.** The real engine addresses it via a placeholder ID within
  that submission (e.g. `f06nU01`); our engine just creates it with an
  auto-generated code, and it becomes orderable from the *next* turn's report
  onward. Needs `app/api/email/inbound/route.ts` changes to route orders to
  a not-yet-existing `unit_id` within one submission.
- **Same-day multi-unit oversubscription price-rise auction isn't
  implemented.** The real mechanism (`LocalMarketRequest` as a depleting
  counter-party, matched via `BasicCompetitiveRequest`'s resolution logic)
  is understood in shape from `RulesNew.txt`'s Market section and
  `LocalMarketRequest.cpp`, but the actual N-way matching algorithm lives in
  `BasicCompetitiveRequest.cpp`, which wasn't pulled — and isn't verifiable
  against real data with the current single-player test setup anyway. RECRUIT
  currently just caps against the pool as a simple first-come request.
- **WITHDRAW is coin-only.** The real order also supports arbitrary items
  (`WITHDRAW amount item`); not built.
- **Unit-level NAME isn't built.** Only faction-level `NAME` exists. New
  units get an auto-generated name (`"New <race plural>"`) instead of being
  nameable via a follow-up order, per the real engine's
  `UNIT f06nU01 / NAME "New Jims"` pattern.

## -4. UPDATE — Report generator wired to real turn_events, MOVE event wording matched to the real archive, and a dev-cache bug that produced a false "verified" claim (fifth session, Claude Code)

### Follow-up (sixth session): faction-level Global Events path now verified for real
The `unit_id IS NULL` / `faction_id`-scoped Global Events query below had the
right shape and correct `applyFactionOrder()` call sites, but no live data
had ever exercised it — the MOVE tests only covered the unit-scoped path.
Closed the gap: injected a real `NAME "Test Faction Renamed"` order directly
into `orders` (faction-level shape: `unit_id: null`, `order_type: 'faction'`
— confirmed against the real email-submission code path in
`app/api/email/inbound/route.ts` before using it), ran a real `process-turn`
against production (`new-overlord.vercel.app`, not localhost), and confirmed
via Resend's API on the actual delivered email: faction genuinely renamed
in the DB, and Global Events showed
`Faction F2028 renamed to "Test Faction Renamed"` in place of the empty-state
text. Clean pass, no bug found — both the unit-scoped and faction-scoped
`turn_events` query paths in `turnReport.ts` are now real-data-verified.

### Real feature built: turnReport.ts's Units and Global Events sections now use real turn_events data
Previously hardcoded regardless of what happened (`"Day 1 - Unit awaiting orders"`,
`"Nothing to report this turn."`) — see `-3` below for why `turn_events` never
had real data to query before this session. Now:
- **Units section** queries `turn_events` by `unit_id` + `turn_number`, renders
  `Day N - <data.description>` per event, sorted by `day_number`. Empty case
  is a genuine `"No actions recorded this turn."`, not a placeholder.
- **Global Events section** queries `turn_events` by `faction_id` +
  `unit_id IS NULL` + `turn_number` (faction-level events: rename, password
  change, unrecognized faction orders). Empty case keeps
  `"Nothing to report this turn."`, now a real empty state instead of an
  unconditional string.

### Real schema change: turn_events.faction_id added
`unit_id IS NULL` (faction-level) events had no way to be scoped back to a
faction except parsing the description text — not reliable. Added
`faction_id uuid` (nullable, no backfill — rows before this migration
legitimately have it null) via `18_add_turn_events_faction_id.sql`
(reference bundle). Threaded through `logEvent()`'s signature (now a
required, no-default parameter — forces every call site to supply it
explicitly, TypeScript-checked) and all 12 call sites in
`turnProcessor.ts`: 9 unit-scoped (`state.unit.faction_id`), 3
faction-order-scoped (`faction.id` directly, in `applyFactionOrder`).
**No DDL execution path exists from the app's Supabase client** (REST-only,
no `DATABASE_URL`/CLI link) — this migration had to be run manually via the
Supabase SQL Editor.

### Real bug found and fixed: MOVE only ever logged one event, worded backwards from the real engine
`completeFullDayOrder()`'s MOVE case said `"<unit> arrives at <destination>"`
— and nothing was logged when a move began at all. Checked against a real
archived report (`reference/game-archive/report18.txt`, ground truth per
section 6) and the actual format is different in both respects:
```
2 - Miras Gate ambasador [57940] departs to Helicona [L5]
2 - Movement will take 9 days
10 - Miras Gate ambasador [57940] arrived from Datmus valley [L2]
```
Fixed to match exactly: `beginFullDayOrder()`'s MOVE case now logs
`"<unit> departs to <dest> [<code>]"` the day the move starts, plus a
separate `"Movement will take N days"` line — **only when N > 1**; every
1-day-move example in the archive completes same-day with no such line.
The origin location (name + loc_code) is captured in `FullDayData`'s
`move` variant at departure time and read back at completion, so the
arrival line correctly says **`"arrived from <origin>"`** (not the
destination — the real engine names where the unit came from, not where
it now is). **Verified against a real delivered email** (Resend API,
`last_event: "delivered"`, not just a local route check — see the dev-cache
lesson below for why that distinction matters):
```
Day 1 - MoveTester [U3483] departs to Valyn Wood [L1206]
Day 1 - Movement will take 9 days
Day 9 - MoveTester [U3483] arrived from Imperial Heartlands [L3487]
```

### Known gap, deliberately not built: "unstacks to move"
The same archived report shows a real event with no equivalent in our code:
`"Miras Gate ambasador [57940] unstacks to move"`, logged the day a MOVE
order begins if other orders are still queued behind it in the same
submission — a notification that the stack got split by movement priority.
**Not implemented** — formal unit stacking (multiple units combining into
one stack) doesn't exist in this app yet, so an "unstacks" notification
would be describing a mechanic that isn't built. Revisit once stacking
itself is designed/built; don't bolt this on before then.

### Standing lesson: a dev server hot-reload can lie about what the real send path is running
This session's first attempt at verifying the report-generator fix produced
a **false positive** — worth understanding exactly how, since it could
recur. Sequence: edited `turnReport.ts`, started `next dev` (Turbopack)
fresh, hit `/api/process-turn` (which internally calls `generateTurnReport`
and emails the result) — the **actual delivered email**, checked directly
via Resend's API, still had the old hardcoded placeholder text. But a
follow-up call to `/api/turn-report` (a separate, read-only route that
calls the exact same `generateTurnReport` function) — hit for the first
time ever in that dev session, immediately after — showed the fix working
correctly. Same running server process, same source file, same function,
different real output. Root cause: Turbopack's dev-mode module cache served
a stale pre-edit compiled bundle to the route that had been exercised in a
*previous* dev session (`process-turn`, hit repeatedly across this
project's history), while the never-before-hit route (`turn-report`)
compiled fresh. **A full `rm -rf .next` before restarting `next dev`
resolved it, confirmed by re-checking the actual Resend-delivered email
content again, not just the local route.**

**The actual lesson, stated generally**: when verifying a fix against a
long-running local dev server, checking a *different* route that happens to
call the same function is not equivalent to checking the actual path that
matters, even though it looks like a valid proxy. If a route has been hit
across multiple dev-server restarts in a project's history, clear `.next`
before trusting any verification against it. This is the same category as
the project's other "looks right vs. actually verified" bugs (see the
Vercel-deployment-status lesson further below), just one layer deeper —
verify against the *specific* path being changed, not an equivalent-looking
one.

---

## -3. UPDATE — Order persistence, a second pagination bug, and a schema mismatch that hid for the whole project (fourth session)

### Real bug found and fixed: second unpaginated locations query
`buildTurnContext()` had its own separate, completely unpaginated
`locations` fetch (`select('*')`, no `.range()`) used to build
`locationsById`/`locCodeToId` for the actual day loop — same 1,000-row
Supabase cap, same 2,500-location world. This one was worse than the
registration-time version fixed last session: if a unit's *current*
location happened to land past row 1,000, `ctx.locationsById.get(...)`
silently returned `undefined`, `exits` fell back to `[]`, MOVE returned
`INVALID`, and **INVALID full-day orders are spliced out with zero logged
event** — so a submitted, correctly-parsed MOVE order could silently do
nothing, with no error anywhere. This is exactly what happened on the
first live MOVE test. Fixed with the same batched `.range()` pagination
pattern. **Any future query against `locations` needs this same check —
there is no single fetch-everything call site left as of this fix, but
watch for new ones.**

### Real feature built: order persistence across turn boundaries
Confirmed directly from `RulesNew.txt`, not assumed: *"If a unit cannot
execute all orders within the turn, those orders will be kept and
executed for the next turn, even if you do not submit a new set of
orders."* A fresh `UNIT` submission replaces the old stack; omitting a
unit's `UNIT` block leaves its carried-forward stack untouched. This was
**not implemented at all before this session** — every turn discarded all
in-memory unit-order state, meaning nothing ever actually carried forward
despite the rules requiring it.

Implemented:
- Two new `units` columns: `pending_orders` (jsonb array) and
  `active_full_day_order` (jsonb, nullable) — see
  `17_add_order_persistence.sql`
- `buildTurnContext()` now loads carried-forward state when no fresh
  submission exists for a unit, instead of defaulting to empty
- `processTurn()` persists the remaining order queue + any in-progress
  full-day order back to the unit row at the end of every turn
- **Movement is specially protected**, per an explicit rule found in the
  same doc: *"the stack will not proceed any other orders... until the
  movement completes."* A fresh submission cannot redirect a unit that's
  mid-move — only `RETREAT` can, per the rules. `RETREAT` itself is **not
  built yet** — the protection is real and enforced now, but attempting
  RETREAT currently just logs `order_pending` and the move continues
  uninterrupted. Building real `RETREAT` is a clear, scoped follow-up.
- **Verified working end-to-end**: a MOVE order was submitted, ran
  correctly, completed, cleared its persisted state correctly
  (`pending_orders: []`, `active_full_day_order: NULL`), and a second
  independent MOVE order the following turn behaved identically.

### Real bug found and fixed: `turn_events` schema never matched the code, at all, ever
This one is significant: **`processTurn()`'s final `turn_events` insert
had never once had its error checked**, since the file was first written.
The real schema (confirmed via `information_schema.columns`, not
assumed) is completely different from what `logEvent()` always produced:

| Code assumed | Real column |
|---|---|
| `description` (text) | `data` (jsonb, NOT NULL) |
| `faction_id` | `unit_id` |
| (never provided) | `day_number` (int, NOT NULL) |
| (never provided) | `is_public` (boolean, NOT NULL) |

Since `day_number` and `is_public` are NOT NULL and were never supplied,
**every single `turn_events` insert for the whole project almost
certainly failed silently, every time** — `eventCount` in every API
response to date was only ever an in-memory array length, never proof
anything reached the database. Fixed by rewriting `logEvent()`'s
signature (adds `day`, swaps `faction_id` for `unit_id`, wraps the
description in `data: {description}`, adds `is_public` defaulting to
`false`) and updating all 12 call sites accordingly, plus **adding actual
error-checking to the insert itself** so this class of bug can never hide
silently again. Faction-level events (rename, password change — which
have no single associated unit) log with `day: 0` and null `unit_id`/
`location_id`.

**Verified working**: a real `turn_events` row now exists in the
database — `turn_number: 2, day_number: 7, event_type: 'unit_arrived',
data: {"description": "..."}`, correct `unit_id`/`location_id` — the
first time this table has ever received a row successfully.

### Known, now-unblocked next task: the report generator's placeholder text
`turnReport.ts`'s "Units" section still hardcodes `Day 1 - Unit awaiting
orders` for every unit, every turn, regardless of what actually happened
— it's never queried `turn_events` at all. This was harmless-looking
before because `turn_events` never had real data anyway; now that it
does, this is a real, well-scoped, ready-to-build task: query
`turn_events` by `unit_id`/`turn_number`, render the real `data.description`
lines per day instead of the static placeholder. Same likely applies to
the "Global Events" section (`"Nothing to report this turn."`, always).

### Standing lesson, reinforced hard again this session
**Every Supabase insert/query needs its error checked, always, without
exception.** Three separate silent-failure bugs this project (`orders`
missing columns, two separate unpaginated `locations` fetches, and now
`turn_events`'s complete schema mismatch) all shared the same root
enabling factor: an unchecked `{ error }` that would have surfaced the
real problem immediately if checked. This is worth treating as a
non-negotiable code review checklist item for any future Supabase call
written by a future session or Claude Code.



### Zone-based auto-assignment for new registrations (DONE, verified working)
Replaced manual GM location assignment with automatic placement. New
players get randomly assigned to a settlement matching their registration's
`ZONE imperial|borders|colonial` choice (default `colonial`), based on
distance from map center:
- **imperial**: `resources.is_imperial_land === true` (world gen's own flag)
- **borders/colonial**: split evenly across the remaining map radius beyond
  the Imperial zone (no explicit tag exists for these in world gen, so it's
  derived from `grid_x`/`grid_y` distance)
- Manual GM assignment (`player.attributes.starting_location` set directly)
  still takes priority if present — this is additive, not a replacement
- Falls back through zones if the requested one has no settlements, rather
  than failing the registration
- **Verified working end-to-end** with 6 seeded test players (2 per zone) —
  see `07_verify_zone_assignment.sql` in the reference bundle for the
  verification query pattern (join players → factions → locations, compute
  actual distance, compare against requested zone)

### Real bug found and fixed: `joined_turn` NOT NULL constraint
`factions.joined_turn` is NOT NULL; original code explicitly inserted
`null`. Fixed by threading the current `turn_number` through from
`processTurn()` into `processPendingRegistrations(gameId, turnNumber)`.
Same category of bug as the earlier `orders` table issue — an unverified
assumption about a nullable column, caught the same way (real error text
from a real test run, not guessed).

### Real bug found and fixed: silent 1,000-row query cap excluding the Imperial cluster
**This one caused real, confusing test failures** — both imperial-zone test
registrations landed in `borders` instead, with no error. Root cause:
Supabase caps query results at 1,000 rows by default; the registration
code's location fetch had no pagination. A 50x50 world has 2,500 locations,
inserted in row-major order (`for y: for x`), so the Imperial City's row
(`y=25`, dead center) lands around index 1,250 in insertion order --
**past the 1,000-row cutoff**. The Imperial pool was silently empty every
time, while borders/colonial (covering earlier rows) worked fine, which
is exactly the confusing partial-failure pattern that showed up.
Fixed by paginating the fetch in 1,000-row batches, matching the pattern
`fetchAllLocations()` in `page.tsx` already used correctly. **Lesson for
any future query against `locations` (2,500 rows) or `units`/similar large
tables: always check whether Supabase's default row cap could silently
truncate results, especially when the query has no explicit `.range()`.**

### A real incident: hours lost chasing the wrong file
A separate session produced a `Module not found: Can't resolve './turnReport'`
build error that persisted across many attempted fixes to `turnProcessor.ts`
and `turnReport.ts` -- both files were actually fine the whole time.
**The real cause: `app/page.tsx` had been accidentally overwritten with
`turnProcessor.ts`'s content** (a copy-paste mixup), so Turbopack was
compiling `page.tsx`'s (wrong) imports (`./supabase`, `./turnReport`,
`./email` -- valid relative to `app/lib/`, invalid relative to `app/`).
Every "fix" to the other two files was irrelevant; the actual broken file
was never being looked at because git checks were only ever run against
`turnProcessor.ts`/`turnReport.ts` specifically.

**Lesson, stated plainly for next time this kind of error occurs:** when a
`Module not found` error references a specific file path (e.g.
`./app/page.tsx:20:1`), *that file* — not the imported module, and not the
file whose content looks like it should be there — is where the actual
problem lives. Check what that file *actually contains* before touching
anything else, especially after a full-file paste operation. Also worth
standing practice going forward: **always run `git status`/`git diff`
after any file edit, before committing**, to confirm the change genuinely
landed — this would have caught the situation much faster.

`page.tsx` restored to its correct content (world regenerate + lock toggle
+ `RegenerateButton` loading state, all from earlier work) and confirmed
working.

### New tool: search-by-loc-code on the world map
`app/components/WorldMap.tsx` now has a search box above the canvas --
type a `loc_code` (e.g. `L0001`), press Enter or click Go, and it selects
that hex (same detail panel as clicking) and smooth-scrolls the map to
center on it. Useful for GM debugging (e.g. directly checking the Imperial
City's real state) as well as general play.

### New tool: comprehensive world-state verification query
`11_verify_fresh_reset.sql` (reference bundle) checks every relevant table
in one query after a world reset -- row counts plus OK/CHECK-THIS verdicts.
**Important correction discovered while using it**: a fresh world is NOT
expected to have zero units/factions -- `generateWorld()` always seeds 5
NPC factions (Imperials, Citizens, Creatures, Merchants, Outlaws) and their
units as a normal part of world creation. `factions: 5`, and nonzero
`units`/`unit_skills`/`unit_items` counts matching NPC content, are the
CORRECT expected state after a reset, not a sign of incomplete cleanup.
Only `players`/`orders`/`structures`/`turn_events`/`faction_titles` should
be genuinely zero.



Everything below was written after Phase 1 closed. This session (following
day) focused on Phase 2 (real data) and infrastructure hardening. Summary:

### Real data migrated from the 2010 engine source
- **`item_defs`**: 122 real items from `items.rules`, replacing guessed
  data. Required discovering the REAL live schema differs substantially
  from assumptions (columns: `category`, `capacity_walk/ride/fly`,
  `equip_slot`, `skill_required`+`skill_level_req` — not `plural`/
  `description`/`price`/boolean flags as first assumed). `skill_required`
  is a real FK into `skill_defs`; migration SQL wraps it in a
  self-resolving subquery so it doesn't fail on not-yet-seeded skills and
  self-heals on re-run.
- **`race_defs`**: new table (didn't exist before), 59 real races (10
  Leader, 8 Follower, 41 Creature) from `races.rules` — base stats,
  movement capacities, study bonuses, starting skills.
- **`skill_defs`**: 299 real skills from `skills.rules` (up from 27
  placeholder rows), with proper `parent_skill_tag`/`unlocks` hierarchy
  built from the source's `REQUIRES` chains. Added `level_days` (jsonb
  array, real per-skill level progression) since the existing
  `days_per_level` (single int) can't represent it — kept `days_per_level`
  too, set to `level_days[0]`, for backward compatibility. **Also
  populated real level-1 combat/stat `effects`** for 162 skills that have
  them, extracted directly from source.

### Real tag mismatches found and resolved (source vs. live app)
Several source tags didn't match the app's existing convention for the
same concept: `hrbs`→`herb`, `airs`→`air_`, `wate`→`watr`, `fshn`→`fish`.
Renamed on insert to update the existing live rows rather than duplicate.
Two live tags (`taxe`, `trad`) confirmed to not exist in the source at
all — legitimate custom additions, left untouched. Two items (`fshi`,
`yew_`) similarly custom, not in `items.rules`.

### Real bugs found and fixed during this migration (worth knowing for future parsing work)
- `REQUIRES` fields can appear *after* the first `LEVEL` block, not just in
  a skill's header — missing this broke the entire parent/child tree on
  first attempt.
- Elemental magic schools (air/water/earth/fire/void) use a **different**
  flag (`ELEMENTAL_MAGIC_SKILL`) than regular magic (`MAGIC_SKILL`) —
  missed on first pass, caused all five elemental schools to be
  miscategorized as non-magic production skills.
- 12 creature-only abilities (`LEARNING_PARADIGM LEARNING_CREATURE`) don't
  carry any of the normal combat/magic/basic flags — needed a dedicated
  `creature` category rather than falling through to a wrong default.
- **Unresolved**: at one point `cmbt`'s `effects` jsonb showed up empty
  after a migration that should not have touched it (verified via direct
  SQL, no duplicate row, no trigger found). No confirmed root cause. Not
  worth chasing further — real level-1 effects were extracted from source
  and re-populated regardless, so the data itself is fine; just flagging
  the unexplained event for awareness.

### Code wired to use the real data
`app/lib/turnProcessor.ts`: STUDY logic now reads `skillDef.level_days`
(real per-skill progression) instead of the old hardcoded
`SKILL_LEVEL_DAYS = [15,45,90,180,360]` constant (removed entirely). New
leader registration now pulls real `upkeep`/`initiative`/`life`/
`observation` from `race_defs`'s `hero` row (upkeep is 20, confirmed
against a real archived report — the old hardcoded `5` was provably
wrong). Combat stats (melee/defense/etc.) for new heroes are still
placeholder — `race_defs` genuinely doesn't define these; they come from
learned skills/equipped items in the real design, which registration
doesn't grant yet. `turnReport.ts` needed no changes — the migration set
`days_per_level = level_days[0]` specifically so the existing display
line already shows real data.

**Open technical question, not resolved**: whether `level_days[N]` values
represent *incremental* days-for-this-level-up or *cumulative* days-from-
zero. Implemented as incremental (matches the app's existing
`experience_days` reset-per-level pattern), but not independently
confirmed against the C++ comparison logic. Worth checking if leveling
speed looks off in actual play.

### Resource contention rules clarified from RulesNew.txt (important for RECRUIT/USE, not yet built)
Contrary to an initial assumption of "seniority"/first-dibs:
- **WORK/wages**: no contention at all. Every unit earns independently
  based on its own work-days × local wage rate. No shared pool.
- **Harvesting (USE, not built yet)**: proportional sharing based on
  harvesting capability when multiple units compete for the same limited
  resource — not first-come-first-served. (15 grain, two units capable of
  20/40 per turn → first gets 5, second gets 10.)
- **Recruiting (RECRUIT, not built yet)**: pool depletes across the month,
  doesn't refill — earlier *days* within the turn genuinely get priority
  access (a natural consequence of day-ordered processing, not a separate
  system). Same-day oversubscription triggers "market rules" (price rises)
  rather than simple exclusion.
- **A real "arrival order" concept does exist** in the source, just not
  for the above: `PROMOTE` repositions units in report order; the
  `floraison` spell only affects units arriving after the caster; upkeep
  shortfalls get covered by same-faction, same-location units' spare cash
  "in order of arrival." None of these require a cross-faction seniority
  system — day-ordering (already implemented) plus a location-grouped view
  (needed for combat anyway, Phase 4) covers all of them.

### Resource contention: RESOLVED — proportional sharing, with a specific override condition
`RulesNew.txt` states harvesting splits *proportionally by harvesting
capability* when demand exceeds supply. This was checked exhaustively
against real evidence before being accepted:

- **Read the actual compiled resolution algorithm**: `EvenConflict::resolve()`
  in the 2010 engine source (`engine\process\conflicts\EvenConflict.cpp`,
  pulled and read in full). It does exactly the proportional-split math the
  manual describes — sum all requests at a location, compute
  `ratio = available / requested`, give each requester `theirRequest * ratio`.
  No list-position/order factor anywhere in the function. (Getting there
  required following a real call chain: `HarvestUsingStrategy` →
  `ResourceCompetitiveRequest` → `BasicCompetitiveRequest` → `EvenConflict`
  — the first three of those are thin/structural, `EvenConflict` is where
  the actual math lives.)
- **Searched real archived play exhaustively for a counter-example**: all
  23 of Ewelin's turns, Jizlerk's turn 23, Weird Animals' turns 19 and 23 —
  three different factions. Zero instances found of multiple units
  competing for the same raw resource at the same location, so no direct
  test case — but one strong indirect data point: report7 shows two
  equal-capability units (Clowns, Jesters, both just reached the same
  entertainment skill level) both drop from 19→18 coins/day on the exact
  same day (day 27), a symmetric reduction consistent with proportional
  splitting and inconsistent with list-order priority (which would produce
  an asymmetric result — one unit steady, the other absorbing the full
  shortfall).

This contradicts what Andy and his brother (a former player) both
independently recall as list-order priority (first unit in a location's
list gets its full daily harvest before the next unit gets anything). Given
the rules doc has 3 authors across 1993-2008+ (Vincent Archer's original,
Alex Dribin's 2008 Alpha update, Chris Johnson's 2008 revisions) plus
Alex's separate 2010 engine rewrite, a doc/engine divergence was a
plausible explanation for the discrepancy — but nothing found supports it
actually being what shipped in this version.

**DECISION: implement proportional sharing (matching `EvenConflict.cpp`)
when USE/harvesting is built (Phase 4).** This is the evidence-backed
choice given everything checked. **Explicit override condition, set by
Andy**: if the wider original team reunites (Jirka, Ferda, Chris, Sean,
Andy) and independently recalls list-order priority the same way, that
consensus overrides this decision — treat it as a deliberate design
choice for this version at that point, not as "we got the source wrong."
Until then, build to the evidence above.

### World reset + lock mechanism (infrastructure, not Phase 2, but done this session)
Discovered `app/page.tsx` already had a working "Regenerate World" button
predating this session (from before — not something introduced tonight),
but it had two real gaps: **never deleted from `players`** (blocked
re-registration of the same test emails after a reset — directly relevant
to the "clear everything, 5 players register" workflow Andy described),
and **no lock protection** at all. Both fixed:
- `players` now included in the delete sequence
- New `games.is_locked` boolean column (migration:
  `05_add_world_lock.sql`)
- Lock toggle button in the UI; "Regenerate World" visually disables when
  locked, plus a server-side throw as the real enforcement layer
- Added a proper pending/loading state (`RegenerateButton.tsx`, a client
  component using `useFormStatus`) — the operation takes real time
  (network round-trip per delete + ~15s generation) and previously gave
  zero visual feedback, looking broken when it wasn't
- Switched `revalidatePath` to `redirect('/')` after both the regenerate
  and lock-toggle actions, since `revalidatePath` alone wasn't reliably
  forcing the browser to show fresh data without a manual refresh

**All of the above is verified working via direct testing this session**,
not just written and assumed — genuine progress from Phase 1's lesson
about the gap between "code looks right" and "actually confirmed working."

---


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
  upkeep yet). Consequence sharpened in section -6: since every idle
  leader/follower unit now correctly defaults to WORK (including NPCs),
  faction funds — NPC and player alike — grow every turn with nothing
  deducting from them. Known and accepted, not a bug; the fix is building
  upkeep, not scoping back WORK's default.
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

## 7. Suggested phase roadmap (updated after fourth session)

1. ~~Close the loop~~ — **DONE.**
2. **Real data pass** — **DATA LAYER DONE** (item_defs/race_defs/skill_defs
   all real, migrated from 2010 source; STUDY logic and hero registration
   wired to use it). Stage 2 (deeper per-level effects, combat actions,
   produce/consume/summon mechanics) still unparsed — separate future work,
   not blocking.
3. **Registration + zone auto-assignment + multi-faction turn processing —
   DONE, verified.** Includes one genuine real `REGISTER` email test (not
   just SQL-seeded) — the last real gap flagged in the previous version of
   this roadmap is now closed.
4. **MOVE + order persistence across turns — DONE, verified.** A real
   submitted MOVE order completed correctly, cleared its persisted state,
   and a second independent MOVE the following turn behaved identically.
   `turn_events` now genuinely receives data for the first time in the
   project (see section -3 above for the schema-mismatch bug that
   previously hid this entirely).
5. **Report generator wired to real turn_events — DONE, verified.**
   `turnReport.ts`'s Units and Global Events sections now query real data
   instead of hardcoded placeholder text; MOVE's departure/arrival wording
   matched exactly to the real archived report format. See section -4
   above, including the dev-cache lesson from how the first verification
   attempt gave a false positive.
6. **RETREAT** — not built. Needed to complete the movement-protection
   story (a unit mid-move currently can only be interrupted by RETREAT
   per the rules, but RETREAT itself doesn't exist yet).
7. **"unstacks to move" notification** — not built, deliberately deferred.
   Real event in the archive (see section -4). Partially superseded by
   section -6: `is_stacked`/`stack_leader_id` are now real and populated for
   player units (RECRUIT), and reports display stacks correctly — but full
   stacking *behavior* (move-together, weight/capacity pooling) still isn't
   built, so there's still nothing for an "unstacks to move" notification to
   describe. Revisit once move-together is built.
8. **Minimum viable combat** — needs `engine/CombatDesign.txt` read first
   (design doc, not code), then real design decisions from Andy before
   implementation
9. **RECRUIT + WITHDRAW — DONE, verified against real production.** See
   section -5 above. `GIVE`, `USE` still need real source pulled before
   building (same discipline as RECRUIT — don't guess). Real, scoped
   follow-ups from RECRUIT/WITHDRAW, not yet built: new-unit same-submission
   order addressing, multi-unit oversubscription price-rise auction,
   item withdrawal, unit-level NAME. TEACH unlocks 3rd+ skill levels.
10. **Default WORK + stacked-unit report display + arrival-order tracking —
    DONE, verified against real production.** See section -6 above. Real
    open item from this work: NPC-seeded units have no real stack
    relationships (`is_stacked`/`stack_leader_id` never assigned by
    `seedNPCFactions.ts`/`seedNPCUnits.ts`), so "Also present" won't show
    NPC pairs grouped even though the grouping logic itself is correct —
    needs NPC seeding changes, not a report fix. Also surfaces (doesn't
    solve) that upkeep being stubbed means NPC (and player) faction funds
    now grow unboundedly from default WORK with no offsetting cost —
    expected until upkeep is built, not a bug to work around.
11. **Playtest readiness** — real starting funds/upkeep numbers (upkeep now
   fixed via race_defs; starting funds still a placeholder `500`), then
   actually recruit 5 people

**Standing practice, reinforced hard this session**: verify things actually
work via direct testing, not just "the code looks right" or "the build is
green." Multiple real bugs this session were caught specifically by
checking actual database state / actual UI behavior rather than trusting
generated code alone.

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
