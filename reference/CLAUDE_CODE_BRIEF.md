# Starting brief for Claude Code — read this first

## Your role on this project

You're the primary development driver going forward. Andy will run you
directly against the real repo, with real file/command access — use that.
Don't ask him to paste file contents or run diagnostic SQL and report back
when you can check the schema, read the file, or run the build yourself.
That back-and-forth was the single biggest source of wasted time in the
chat-based sessions that got this project to its current state — you don't
have that constraint, so don't reproduce it.

## How decisions route

Two kinds of things come up:

1. **Implementation calls** — which file needs what fix, how to structure
   a query, whether a bug is in the code or the schema. These are yours.
   Verify against real data before concluding anything, the same way this
   project's chat sessions learned to (the hard way — see section 6).

2. **Judgment calls that are genuinely Andy's** — game-design numbers
   (starting funds, upkeep, balance), whether a design question needs the
   original player group's input, whether something's ready for real
   playtesters. When you hit one of these, **ask Andy directly, in chat.**
   Don't guess and don't silently pick a default. If it's a question worth
   deep-diving with more reasoning/research than a quick answer needs — the
   kind of thing that took real back-and-forth to resolve in prior sessions
   (see the resource-contention example below) — say so, and Andy will
   bring it to Claude (the chat assistant) separately. You don't need to
   solve those yourself.

## What to read first, in order

1. `reference/HANDOVER.md` — the full project history, in full. Written
   iteratively across four chat sessions specifically so a new session (or
   you) doesn't have to rediscover things. Read all of it, not just the
   latest section — earlier sections cover the data migration, the world
   reset/lock system, and root-caused bugs that could resurface in similar
   form elsewhere.
2. `RulesNew.txt` — the design authority. When in doubt about how a
   mechanic should work, check here before guessing or asking.
3. `reference/inventories/2010_engine_full_inventory.txt` — full file
   listing of the real 2010 C++ engine. Most order types haven't been
   pulled into the reference bundle yet (only STUDY/MOVE/WORK have real
   source pulled and verified). **Before implementing any new order type
   (RECRUIT, GIVE, USE, TEACH, RETREAT, etc.), find and read its real
   `.cpp`/`.h` pair from this inventory first.** Every order built against
   real source this way has held up; nothing guessed has.
4. `reference/knowledge-base/` — the magic/spell data, if magic-related
   work comes up.

## What's actually proven working right now (verified, not assumed)

- Registration (email + auto zone assignment: imperial/borders/colonial)
- Order submission via email, parsing, storage
- Turn processing: NAME, PASSWORD, GUARD, WORK, STUDY, MOVE (walking only)
- Order persistence across turn boundaries (a unit's remaining stack
  carries forward if not resubmitted; movement is protected from being
  overridden except by RETREAT, which isn't built)
- Report generation + email delivery, wired to real `turn_events` data
  (Units and Global Events sections; MOVE departure/arrival wording matched
  exactly to the real archived report format — see HANDOVER.md section -4)
- World reset/regenerate + lock toggle
- Real item/race/skill data (122/59/299 rows) migrated from the 2010
  source, replacing earlier placeholder guesses

## What's real and open, not done

- **RETREAT** — not built. Needed to complete the movement-protection
  story described above.
- **RECRUIT, GIVE, USE** — recognized by the parser, not implemented.
  Real contention rules for these are already resolved (see below) — pull
  the real source before building, same as MOVE/STUDY/WORK.
- **"unstacks to move" notification** — a real event in the archive
  (logged when a MOVE begins with other orders still queued behind it),
  deliberately not built yet — formal unit stacking doesn't exist, so
  there's nothing for the notification to describe. Revisit once stacking
  itself is designed/built. See HANDOVER.md section -4.
- **Combat** — not designed or built. Read `engine/CombatDesign.txt` (not
  yet pulled into the bundle — find it in the inventory) before writing
  any code. This will need real design input from Andy, not just
  source-translation, given its scope.
- **Riding/flying movement** — MOVE only supports walking currently.
- **Real starting funds/upkeep numbers** — currently a placeholder `500`
  funds, flagged `TODO` in the code. This is exactly the kind of judgment
  call to bring to Andy directly, not decide unilaterally.

## One resolved example worth knowing about, as a model for how deep some
## questions can go

Resource-harvesting contention (does it split proportionally, or by
list/arrival order?) took real investigation across a full chat session:
reading the actual compiled C++ resolution algorithm
(`EvenConflict::resolve()`), searching real archived play data from three
different factions for a test case, and ultimately a explicit,
documented decision with a stated override condition (if the original
player group's memory converges independently, that overrides the
evidence-based default). Full writeup is in `HANDOVER.md`. This is the
kind of question that's worth flagging to Andy to bring to Claude for a
proper research pass, rather than resolving quickly yourself — not every
open question is like this, but some are, and it's fine to say so.

## Standing technical lessons, worth internalizing before writing new code

- **Never trust an assumed schema.** Multiple real bugs this project were
  columns that didn't exist, weren't nullable, or were named differently
  than assumed (`orders.game_id`/`order_type`/`status`,
  `turn_events`'s entire shape, `factions.joined_turn`). Check the real
  schema before writing an insert/query against a table you haven't
  touched recently.
- **Every Supabase call needs its error checked.** The `turn_events`
  bug went undetected for the whole project specifically because its
  insert's error was never checked — `eventCount` looked fine in every
  API response while the database silently received nothing.
- **Supabase caps query results at 1,000 rows by default.** This world
  has 2,500 locations. Two separate real bugs this project were exactly
  this — an unpaginated query silently truncating before reaching data
  that mattered. Paginate any query that could plausibly return more than
  1,000 rows.
- **After any deploy, confirm Vercel shows green before assuming a fix
  landed.** Production was silently stuck on stale/failed builds for
  extended periods, multiple times, undetected until directly checked.
