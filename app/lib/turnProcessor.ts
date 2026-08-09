// app/lib/turnProcessor.ts
//
// STAGE 2: rebuilt day-loop to match the original engine's semantics
// (confirmed against Alex Dribin's 2010 C++ source: OrderProcessor.cpp,
// OrderLine.cpp). Adds STUDY and MOVE (walking only — riding/flying
// capacity deferred to Stage 2c pending unit_items/item_defs wiring).
//
// Orders implemented: NAME, PASSWORD (faction), GUARD, WORK, STUDY, MOVE,
// WITHDRAW, RECRUIT (unit) -- RECRUIT/WITHDRAW confirmed against real source
// (RecruitOrder.cpp, RecruitRequest.cpp, NewRecruitRequest.cpp, MarketRequest.cpp,
// LocalMarketRequest.cpp, WithdrawOrder.cpp) and RulesNew.txt, not guessed --
// see reference/HANDOVER.md for the money-model findings (unit money vs.
// faction funds, WITHDRAW as the only sanctioned transfer path for RECRUIT).
// Orders recognized but NOT yet implemented: GIVE, USE, MARCH,
// and everything else in RulesNew.txt (TEACH, EQUIP, SPLIT, ENTER/LEAVE, etc.)
// — these log an `order_pending` event and stay queued, untouched, for a
// later stage rather than being silently dropped.
//
// Still NOT done here: wages/upkeep/desertion at month-end, outlaw spawning.
// Report generation/emailing and turn_number increment ARE done (Stage 4a).

import { supabase } from './supabase'
import bcrypt from 'bcryptjs'
import type { ParsedOrder } from './orderParser'
import { generateTurnReport } from './turnReport'
import { sendEmail } from './email'

const DAYS_PER_TURN = 30
const SELF_STUDY_MAX_LEVEL = 2 // levels above this require a teacher (Stage 3+)

const DIRECTION_MAP: Record<string, string> = {
  N: 'North', NE: 'NorthEast', SE: 'SouthEast',
  S: 'South', SW: 'SouthWest', NW: 'NorthWest',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnitRow {
  id: string
  faction_id: string
  location_id: string
  unit_code: string
  name: string
  unit_type: string
  unit_race: string
  is_leader: boolean
  is_hero: boolean
  is_stacked: boolean
  stack_leader_id: string | null
  figure_count: number
  upkeep_per_figure: number
  money: number
  stack_position: number | null
  attributes: Record<string, any> | null
  [key: string]: any
}

interface RaceDefRow {
  tag: string
  category: 'LEADER' | 'FOLLOWER' | 'CREATURE'
  name: string
  plural: string
  base_stats: Record<string, number> | null
  [key: string]: any
}

interface FactionRow {
  id: string
  game_id: string
  faction_code: string
  name: string
  is_npc: boolean
  funds: number
  status: string
  player_id: string | null
  [key: string]: any
}

interface LocationExit {
  direction: string
  dest_loc_code: string
  dest_terrain: string
  dest_name: string
  walk_days: number | null
  ride_days: number | null
  fly_days: number | null
  sail_days: number | null
  impassable: boolean
  sailing_only: boolean
}

interface LocationRow {
  id: string
  loc_code: string
  economics: Record<string, any> | null
  resources: { exits?: LocationExit[]; [key: string]: any } | null
  [key: string]: any
}

interface SkillDefRow {
  tag: string
  name: string
  category: string
  days_per_level: number | null
  level_days: number[] | null  // real per-skill, per-level progression from skills.rules
  cost_per_day: number | null
  leader_only: boolean
  specialist: boolean
  is_magic: boolean
  [key: string]: any
}

interface UnitSkillRow {
  id?: string
  unit_id: string
  skill_tag: string
  level: number
  experience_days: number
  [key: string]: any
}

type FullDayData =
  | { kind: 'move'; targetLocationId: string; targetLocCode: string; originLocationId: string; originLocCode: string; originName: string }
  | { kind: 'study'; targetLevel: number }
  | { kind: 'none' }

interface ActiveFullDayOrder {
  order: ParsedOrder
  daysRemaining: number
  data: FullDayData
}

interface UnitOrderState {
  unit: UnitRow
  orders: ParsedOrder[]
  fullDayOrder: ActiveFullDayOrder | null
  dirty: boolean
  recruitedToday: boolean // blocks a same-day MOVE from beginning -- "the leader will not be able to move during the day he recruits" (RulesNew.txt)
}

interface TurnContext {
  gameId: string
  turnNumber: number
  factionsById: Map<string, FactionRow>
  locationsById: Map<string, LocationRow>
  locCodeToId: Map<string, string>
  unitCodeToId: Map<string, string>
  skillDefsByTag: Map<string, SkillDefRow>
  raceDefsByTag: Map<string, RaceDefRow>
  unitSkills: Map<string, Map<string, UnitSkillRow>> // unitId -> tag -> row
  dirtyUnitSkills: Set<string>
  dirtyLocationIds: Set<string> // locations whose economics.recruits pool was depleted this turn
  locationMaxStackPosition: Map<string, number> // lazily-computed running max stack_position per location, for arrival ordering
  unitStates: Map<string, UnitOrderState>
  eventLog: { game_id: string; turn_number: number; day_number: number; location_id: string | null; unit_id: string | null; faction_id: string | null; event_type: string; data: any; is_public: boolean }[]
}

type OrderStatus = 'SUCCESS' | 'FAILURE' | 'INVALID' | 'IN_PROGRESS'

function logEvent(
  ctx: TurnContext,
  day: number,
  event_type: string,
  description: string,
  faction_id: string | null,
  unit_id: string | null = null,
  location_id: string | null = null,
  is_public: boolean = false
) {
  ctx.eventLog.push({
    game_id: ctx.gameId,
    turn_number: ctx.turnNumber,
    day_number: day,
    location_id,
    unit_id,
    faction_id,
    event_type,
    data: { description },
    is_public,
  })
}

// Real archived reports (report18.txt) list units at a location in arrival
// order, earliest first -- this assigns the next position for a unit newly
// present at a location (MOVE arrival, RECRUIT's new unit). Lazily seeded
// from the real current max among units already at that location (scanning
// ctx.unitStates, which covers every unit in the game, not just this
// faction's), then incremented in memory for the rest of the turn so
// multiple arrivals at the same location on the same turn stay correctly
// ordered relative to each other.
function nextStackPosition(ctx: TurnContext, locationId: string): number {
  if (!ctx.locationMaxStackPosition.has(locationId)) {
    let max = 0
    for (const state of ctx.unitStates.values()) {
      if (state.unit.location_id === locationId && typeof state.unit.stack_position === 'number' && state.unit.stack_position > max) {
        max = state.unit.stack_position
      }
    }
    ctx.locationMaxStackPosition.set(locationId, max)
  }
  const next = ctx.locationMaxStackPosition.get(locationId)! + 1
  ctx.locationMaxStackPosition.set(locationId, next)
  return next
}

// ---------------------------------------------------------------------------
// Registration processing
// ---------------------------------------------------------------------------

export async function processPendingRegistrations(gameId: string, turnNumber: number): Promise<{ created: number; skipped: string[] }> {
  const skipped: string[] = []
  let created = 0

  const { data: pendingPlayers, error } = await supabase.from('players').select('*').eq('status', 'pending')
  if (error) throw new Error(`Failed to load pending players: ${error.message}`)
  if (!pendingPlayers || pendingPlayers.length === 0) return { created: 0, skipped: [] }

  // Real starting-leader stats from race_defs (2010 engine source), replacing
  // the earlier hardcoded guesses. Only covers what the 'hero' race actually
  // defines (upkeep/initiative/observation/life/control) -- combat stats
  // (melee/defense/damage/etc.) aren't part of a race's base stats in the
  // source; those come from learned skills and equipped items instead, which
  // this registration step doesn't grant yet. Left as their prior placeholder
  // values below, flagged accordingly, rather than guessing further.
  const { data: heroRace } = await supabase.from('race_defs').select('base_stats').eq('tag', 'hero').maybeSingle()
  const heroStats = heroRace?.base_stats as Record<string, number> | undefined

  // Real settlement locations across all three starting zones, fetched once
  // per batch rather than per-player. Each zone maps to a distance band from
  // the Imperial City, matching the "ZONE imperial|borders|colonial" choice
  // offered at registration (see handleRegistration in the inbound email
  // route). worldGenerator.ts only tags is_imperial_land explicitly -- the
  // borders/colonial split is derived here from grid distance, split evenly
  // across the remaining map radius beyond the Imperial zone.
  const IMPERIAL_RADIUS = 4 // must match worldGenerator.ts's imperialRadius
  const { data: worldRow } = await supabase.from('worlds').select('id, width, height').eq('game_id', gameId).limit(1).maybeSingle()

  const settlementsByZone: Record<'imperial' | 'borders' | 'colonial', string[]> = {
    imperial: [], borders: [], colonial: [],
  }

  if (worldRow) {
    const cx = Math.floor((worldRow.width ?? 50) / 2)
    const cy = Math.floor((worldRow.height ?? 50) / 2)
    const maxDist = Math.sqrt(cx * cx + cy * cy)
    const bordersColonialSplit = IMPERIAL_RADIUS + (maxDist - IMPERIAL_RADIUS) / 2

    // Paginated -- a 50x50 world has 2,500 locations, well past Supabase's
    // default 1,000-row cap. Without this, rows past index 1000 (which,
    // given row-major insertion order, includes the Imperial City cluster
    // near the vertical center) silently never get fetched at all.
    let candidateLocations: any[] = []
    let fetchFrom = 0
    const FETCH_BATCH = 1000
    while (true) {
      const { data: batch } = await supabase
        .from('locations')
        .select('id, resources, grid_x, grid_y')
        .eq('world_id', worldRow.id)
        .range(fetchFrom, fetchFrom + FETCH_BATCH - 1)
      if (!batch || batch.length === 0) break
      candidateLocations = candidateLocations.concat(batch)
      if (batch.length < FETCH_BATCH) break
      fetchFrom += FETCH_BATCH
    }

    for (const l of candidateLocations || []) {
      if (!l.resources?.population_center) continue // must be an actual settlement, not open plains
      if (l.resources?.is_imperial_land === true) {
        settlementsByZone.imperial.push(l.id)
        continue
      }
      const dist = Math.sqrt((l.grid_x - cx) ** 2 + (l.grid_y - cy) ** 2)
      if (dist <= bordersColonialSplit) settlementsByZone.borders.push(l.id)
      else settlementsByZone.colonial.push(l.id)
    }
  }

  for (const player of pendingPlayers) {
    let startingLocationId = player.attributes?.starting_location

    if (!startingLocationId) {
      const requestedZone = (player.attributes?.starting_zone || 'colonial') as 'imperial' | 'borders' | 'colonial'
      let pool = settlementsByZone[requestedZone]

      // Fall back through the other zones rather than fail outright if the
      // requested zone happens to have no settlements (e.g. a small test world).
      if (!pool || pool.length === 0) {
        pool = settlementsByZone.imperial.length > 0 ? settlementsByZone.imperial
             : settlementsByZone.borders.length > 0 ? settlementsByZone.borders
             : settlementsByZone.colonial
      }

      if (!pool || pool.length === 0) {
        skipped.push(`${player.email}: no settlement locations found anywhere to auto-assign -- has the world been generated?`)
        continue
      }
      startingLocationId = pool[Math.floor(Math.random() * pool.length)]
    }

    const factionCode = await generateUniqueFactionCode()
    const displayName = player.display_name || player.email.split('@')[0]

    const { data: faction, error: factionError } = await supabase
      .from('factions')
      .insert({
        game_id: gameId,
        player_id: player.id,
        faction_code: factionCode,
        name: `${displayName}'s Faction`,
        faction_type: 'player',
        is_npc: false,
        funds: 500, // TODO confirm starting funds with Andy
        control_points_max: 200,
        status: 'active',
        joined_turn: turnNumber,
        stances: {},
        attributes: {
          leader_type: player.attributes?.leader_type || 'general',
          element: player.attributes?.element || null,
        },
        starting_location: startingLocationId,
      })
      .select()
      .single()

    if (factionError || !faction) {
      skipped.push(`${player.email}: faction creation failed — ${factionError?.message}`)
      continue
    }

    const unitCode = await generateUniqueUnitCode()

    const { error: unitError } = await supabase.from('units').insert({
      faction_id: faction.id,
      location_id: startingLocationId,
      unit_code: unitCode,
      name: `${displayName}`,
      unit_type: 'leader',
      unit_race: 'human',
      is_hero: true,
      is_leader: true,
      figure_count: 1,
      upkeep_per_figure: heroStats?.upkeep ?? 20, // real value from race_defs (was hardcoded 5 -- confirmed wrong against an actual live report)
      initiative: heroStats?.initiative ?? 2,
      melee: 1, // TODO: not part of race_defs -- comes from learned skills/equipped items in the real design, not granted here yet
      defense: 1, // TODO: same as above
      missile: 0,
      life: heroStats?.life ?? 4,
      hits: 4,
      damage: 1,
      ranged_damage: 0,
      stealth: 1,
      observation: heroStats?.observation ?? 4,
      mana_current: 0,
      mana_max: 0,
      stack_position: 1, // registration always creates at position 1 (Andy's spec)
      attributes: {},
    })

    if (unitError) {
      skipped.push(`${player.email}: starting unit creation failed — ${unitError.message}`)
      continue
    }

    await supabase.from('players').update({ status: 'active' }).eq('id', player.id)
    created++
  }

  return { created, skipped }
}

async function generateUniqueFactionCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `F${Math.floor(1000 + Math.random() * 9000)}`
    const { data } = await supabase.from('factions').select('id').eq('faction_code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('Could not generate unique faction code after 20 attempts')
}

async function generateUniqueUnitCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `U${Math.floor(1000 + Math.random() * 9000)}`
    const { data } = await supabase.from('units').select('id').eq('unit_code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('Could not generate unique unit code after 20 attempts')
}

// ---------------------------------------------------------------------------
// Turn setup
// ---------------------------------------------------------------------------

async function buildTurnContext(gameId: string, turnNumber: number): Promise<TurnContext> {
  const { data: factions, error: factionsError } = await supabase.from('factions').select('*').eq('game_id', gameId).eq('status', 'active')
  if (factionsError) throw new Error(`Failed to load factions: ${factionsError.message}`)
  const factionsById = new Map<string, FactionRow>()
  for (const f of factions || []) factionsById.set(f.id, f)

  // Paginated -- same fix as the registration zone query. A 50x50 world has
  // 2,500 locations, past Supabase's default 1,000-row cap. Without this,
  // any location past row 1000 (in whatever order Supabase returns) is
  // silently missing from locationsById, causing MOVE (and anything else
  // that looks up a unit's current location) to fail as INVALID with no
  // logged event at all -- exactly the "MOVE silently did nothing" bug.
  let locations: any[] = []
  let locFetchFrom = 0
  const LOC_FETCH_BATCH = 1000
  while (true) {
    const { data: locBatch, error: locationsError } = await supabase
      .from('locations')
      .select('*')
      .range(locFetchFrom, locFetchFrom + LOC_FETCH_BATCH - 1)
    if (locationsError) throw new Error(`Failed to load locations: ${locationsError.message}`)
    if (!locBatch || locBatch.length === 0) break
    locations = locations.concat(locBatch)
    if (locBatch.length < LOC_FETCH_BATCH) break
    locFetchFrom += LOC_FETCH_BATCH
  }
  const locationsById = new Map<string, LocationRow>()
  const locCodeToId = new Map<string, string>()
  for (const l of locations || []) {
    locationsById.set(l.id, l)
    locCodeToId.set(l.loc_code, l.id)
  }

  const { data: skillDefs, error: skillDefsError } = await supabase.from('skill_defs').select('*')
  if (skillDefsError) throw new Error(`Failed to load skill_defs: ${skillDefsError.message}`)
  const skillDefsByTag = new Map<string, SkillDefRow>()
  for (const s of skillDefs || []) skillDefsByTag.set(s.tag, s)

  const { data: raceDefs, error: raceDefsError } = await supabase.from('race_defs').select('*')
  if (raceDefsError) throw new Error(`Failed to load race_defs: ${raceDefsError.message}`)
  const raceDefsByTag = new Map<string, RaceDefRow>()
  for (const r of raceDefs || []) raceDefsByTag.set(r.tag, r)

  const factionIds = Array.from(factionsById.keys())
  const safeFactionIds = factionIds.length > 0 ? factionIds : ['00000000-0000-0000-0000-000000000000']

  const { data: units, error: unitsError } = await supabase.from('units').select('*').in('faction_id', safeFactionIds)
  if (unitsError) throw new Error(`Failed to load units: ${unitsError.message}`)

  const unitCodeToId = new Map<string, string>()
  for (const u of units || []) unitCodeToId.set(u.unit_code, u.id)

  const unitIds = (units || []).map(u => u.id)

  // Chunked to avoid Supabase's URL length limit on large .in() lists --
  // with NPC units across a 50x50 world, unitIds can run into the hundreds.
  const unitSkillRows: any[] = []
  const CHUNK_SIZE = 150
  for (let i = 0; i < unitIds.length; i += CHUNK_SIZE) {
    const chunk = unitIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase.from('unit_skills').select('*').in('unit_id', chunk)
    if (error) throw new Error(`Failed to load unit_skills (rows ${i}-${i + chunk.length}): ${error.message}`)
    if (data) unitSkillRows.push(...data)
  }

  const unitSkills = new Map<string, Map<string, UnitSkillRow>>()
  for (const row of unitSkillRows || []) {
    if (!unitSkills.has(row.unit_id)) unitSkills.set(row.unit_id, new Map())
    unitSkills.get(row.unit_id)!.set(row.skill_tag, row)
  }

  const { data: orderRows, error: ordersError } = await supabase.from('orders').select('*').eq('turn_number', turnNumber).in('faction_id', safeFactionIds)
  if (ordersError) throw new Error(`Failed to load orders: ${ordersError.message}`)

  const eventLog: TurnContext['eventLog'] = []
  const ctx: TurnContext = {
    gameId, turnNumber, factionsById, locationsById, locCodeToId, unitCodeToId,
    skillDefsByTag, raceDefsByTag, unitSkills, dirtyUnitSkills: new Set(),
    dirtyLocationIds: new Set(),
    locationMaxStackPosition: new Map(),
    unitStates: new Map(), eventLog,
  }

  const factionOrderRows = (orderRows || []).filter(r => r.unit_id === null)
  for (const row of factionOrderRows) {
    const faction = factionsById.get(row.faction_id)
    if (!faction) continue
    const orders: ParsedOrder[] = row.orders_parsed || []
    for (const order of orders) await applyFactionOrder(ctx, faction, order)
  }

  const ordersByUnitId = new Map<string, ParsedOrder[]>()
  for (const row of orderRows || []) {
    if (!row.unit_id) continue
    ordersByUnitId.set(row.unit_id, row.orders_parsed || [])
  }

  for (const unit of units || []) {
    const hasFreshSubmission = ordersByUnitId.has(unit.id)
    const carriedActiveOrder = (unit as any).active_full_day_order as ActiveFullDayOrder | null
    const carriedPending: ParsedOrder[] = (unit as any).pending_orders || []

    let orders: ParsedOrder[]
    let fullDayOrder: ActiveFullDayOrder | null

    if (carriedActiveOrder && carriedActiveOrder.data?.kind === 'move') {
      // Movement is protected per RulesNew.txt: "the stack will not proceed
      // any other orders... until the movement completes" -- a fresh
      // submission cannot redirect it. Only RETREAT can (not yet built).
      if (hasFreshSubmission) {
        const freshOrders = ordersByUnitId.get(unit.id)!
        if (freshOrders[0]?.command === 'RETREAT') {
          logEvent(ctx, 0, 'order_pending', `${unit.name} [${unit.unit_code}]: RETREAT not yet implemented -- movement continues`, unit.faction_id, unit.id, unit.location_id)
        } else if (freshOrders.length > 0) {
          logEvent(ctx, 0, 'orders_ignored', `${unit.name} [${unit.unit_code}]: new orders ignored -- unit is mid-movement and cannot be redirected except by RETREAT`, unit.faction_id, unit.id, unit.location_id)
        }
      }
      orders = carriedPending.map(o => ({ ...o }))
      fullDayOrder = carriedActiveOrder
    } else if (hasFreshSubmission) {
      // Fresh submission replaces the old stack entirely, abandoning any
      // non-move order that was mid-progress (e.g. a partial STUDY/WORK).
      orders = ordersByUnitId.get(unit.id)!.map(o => ({ ...o }))
      fullDayOrder = null
    } else {
      // Nothing submitted this turn -- carry forward exactly as-is.
      orders = carriedPending.map(o => ({ ...o }))
      fullDayOrder = carriedActiveOrder
    }

    ctx.unitStates.set(unit.id, {
      unit,
      orders,
      fullDayOrder,
      dirty: false,
      recruitedToday: false,
    })
  }

  return ctx
}

async function applyFactionOrder(ctx: TurnContext, faction: FactionRow, order: ParsedOrder) {
  switch (order.command) {
    case 'NAME': {
      const nameMatch = order.raw.match(/"([^"]+)"/)
      const newName = nameMatch ? nameMatch[1] : order.args.join(' ')
      if (!newName) break
      await supabase.from('factions').update({ name: newName }).eq('id', faction.id)
      faction.name = newName
      logEvent(ctx, 0, 'faction_renamed', `Faction ${faction.faction_code} renamed to "${newName}"`, faction.id, null, null)
      break
    }
    case 'PASSWORD': {
      const newPassword = order.args[0]
      if (!newPassword) break
      const hash = await bcrypt.hash(newPassword, 10)
      await supabase.from('players').update({ password_hash: hash }).eq('id', faction.player_id)
      logEvent(ctx, 0, 'password_changed', `Faction ${faction.faction_code} changed password`, faction.id, null, null)
      break
    }
    default:
      logEvent(ctx, 0, 'order_pending', `Faction order ${order.command} not yet implemented`, faction.id, null, null)
  }
}

// ---------------------------------------------------------------------------
// Conditional/alternative cascade — mirrors OrderProcessor::postProcessOrder
// ---------------------------------------------------------------------------

function postProcessCascade(state: UnitOrderState, fromIndex: number, result: 'SUCCESS' | 'INVALID') {
  let i = fromIndex + 1
  while (i < state.orders.length) {
    const o = state.orders[i]
    const hasCondition = o.conditional > 0
    const hasAlternative = o.alternative
    if (!hasCondition && !hasAlternative) return // first unconditional order stops the cascade

    if (result === 'SUCCESS') {
      if (o.conditional > 0) o.conditional--
      if (o.alternative) {
        state.orders.splice(i, 1)
        continue
      }
      i++
    } else {
      if (o.alternative) {
        o.alternative = false
        if (o.conditional > 0) {
          state.orders.splice(i, 1)
          continue
        }
        i++
      } else if (o.conditional > 0) {
        state.orders.splice(i, 1)
        continue
      } else {
        i++
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Day loop
// ---------------------------------------------------------------------------

const FULL_DAY_COMMANDS = new Set(['WORK', 'STUDY', 'MOVE', 'MARCH', 'GIVE', 'USE'])
const NOT_YET_IMPLEMENTED_FULL_DAY = new Set(['MARCH', 'GIVE', 'USE'])

async function processUnitDay(ctx: TurnContext, state: UnitOrderState, day: number) {
  state.recruitedToday = false

  if (state.fullDayOrder) {
    tickFullDayOrder(ctx, state, day)
    if (!state.fullDayOrder || state.fullDayOrder.daysRemaining <= 0) {
      completeFullDayOrder(ctx, state, day)
    }
    return
  }

  // "the WORK order, which is also the default (i.e., all your orders lists
  // end up with an invisible WORK)" -- RulesNew.txt. Applies whenever the
  // real order queue is exhausted (from the start of the turn, or after
  // other orders complete partway through it), not just brand-new units.
  // WORK itself is "Leader/follower only" per the rules -- creature-type
  // units don't get this default.
  if (state.orders.length === 0 && (state.unit.unit_type === 'leader' || state.unit.unit_type === 'follower')) {
    state.orders.push({ raw: 'WORK', repeat: true, conditional: 0, alternative: false, command: 'WORK', args: [] })
  }

  for (let i = 0; i < state.orders.length; i++) {
    const order = state.orders[i]

    if (order.dayRestriction !== undefined && order.dayRestriction !== day) continue
    if (order.conditional > 0) continue

    if (FULL_DAY_COMMANDS.has(order.command)) {
      const outcome = beginFullDayOrder(ctx, state, order, day)

      if (outcome.status === 'FAILURE') continue

      if (outcome.status === 'INVALID') {
        postProcessCascade(state, i, 'INVALID')
        state.orders.splice(i, 1)
        return
      }

      state.fullDayOrder = { order, daysRemaining: outcome.daysRemaining!, data: outcome.data! }
      state.orders.splice(i, 1)
      tickFullDayOrder(ctx, state, day)
      if (!state.fullDayOrder || state.fullDayOrder.daysRemaining <= 0) {
        completeFullDayOrder(ctx, state, day)
      }
      return
    }

    const outcome = await executeImmediateOrder(ctx, state, order, day)

    if (outcome.status === 'FAILURE') continue

    if (outcome.status === 'INVALID') {
      postProcessCascade(state, i, 'INVALID')
      state.orders.splice(i, 1)
      i--
      continue
    }

    postProcessCascade(state, i, 'SUCCESS')
    if (!order.repeat) {
      state.orders.splice(i, 1)
      i--
    }
  }
}

async function executeImmediateOrder(ctx: TurnContext, state: UnitOrderState, order: ParsedOrder, day: number): Promise<{ status: OrderStatus }> {
  switch (order.command) {
    case 'GUARD': {
      state.unit.attributes = { ...(state.unit.attributes || {}), guarding: true }
      state.dirty = true
      logEvent(ctx, day, 'unit_guard', `${state.unit.name} [${state.unit.unit_code}] takes up guard duty`, state.unit.faction_id, state.unit.id, state.unit.location_id)
      return { status: 'SUCCESS' }
    }

    case 'WITHDRAW':
      return withdrawOrder(ctx, state, order, day)

    case 'RECRUIT':
      return recruitOrder(ctx, state, order, day)

    default:
      return { status: 'FAILURE' }
  }
}

// ---------------------------------------------------------------------------
// WITHDRAW — WithdrawOrder.cpp: immediate, city-only, capped transfer from
// faction funds into the issuing unit's own money. Coin only for now (the
// real order also supports arbitrary items via WithdrawOrder's optional
// second parameter; deferred -- would need item_defs/unit_items wiring on
// top of everything here, matching the same "don't build on nothing"
// discipline as deferring the unstacks-to-move notification).
// ---------------------------------------------------------------------------

function withdrawOrder(ctx: TurnContext, state: UnitOrderState, order: ParsedOrder, day: number): { status: OrderStatus } {
  const requested = parseInt(order.args[0] || '0')
  if (isNaN(requested) || requested < 0) return { status: 'INVALID' } // negative = deposit, "not supported yet" per the real source too

  const location = ctx.locationsById.get(state.unit.location_id)
  const settlementType = location?.resources?.population_center?.type
  // Real engine gates on terrain === "city" -- our schema has no such terrain_type
  // (only natural terrain: plains/forest/hills/...). "city" only exists as
  // resources.population_center.type, alongside village/town/imperial. Andy's
  // call: city AND imperial both qualify (imperial is the capital, should always
  // count as bank-capable).
  if (settlementType !== 'city' && settlementType !== 'imperial') {
    return { status: 'FAILURE' } // retry next day, e.g. if the unit later moves into a city
  }

  const faction = ctx.factionsById.get(state.unit.faction_id)
  const available = faction?.funds ?? 0
  const realAmount = Math.max(0, Math.min(requested, available))

  if (realAmount === 0) return { status: 'INVALID' } // matches source: realAmount==0 -> INVALID

  if (faction) faction.funds -= realAmount
  state.unit.money = (state.unit.money ?? 0) + realAmount
  state.dirty = true

  logEvent(
    ctx, day, 'unit_withdraws',
    `${state.unit.name} [${state.unit.unit_code}] withdraws ${realAmount} coins from faction funds`,
    state.unit.faction_id, state.unit.id, state.unit.location_id
  )

  if (realAmount < requested) {
    logEvent(
      ctx, day, 'withdraw_fund_empty',
      `Faction funds exhausted -- ${state.unit.name} [${state.unit.unit_code}] could only withdraw ${realAmount} of ${requested} requested`,
      state.unit.faction_id, null, null
    )
  }

  return { status: 'SUCCESS' }
}

// ---------------------------------------------------------------------------
// RECRUIT — RecruitOrder.cpp / RecruitRequest.cpp / NewRecruitRequest.cpp /
// LocalMarketRequest.cpp. Immediate, leader only. Funded strictly from the
// issuing unit's own money (unit.money) -- never faction funds automatically,
// confirmed against RulesNew.txt's WITHDRAW section and the request source
// (Andy's call: no faction-fund fallback, matching the source exactly).
//
// "number=0" -> as much as affordable, resolved once and done (matches the
// real completeOrderProcessing control flow: the 0-shortcut never writes
// back to the order's stored amount, so completeOrderProcessing's
// `amount(0) > result` check is always false -> always SUCCESS after one
// attempt, never retried). An explicit non-zero number that can't be fully
// filled decrements in place and retries next day.
//
// Simplifications, flagged rather than silently cut:
// - Same-day multi-unit oversubscription auction/price-rise (LocalMarketRequest's
//   real contention math) isn't implemented -- pool is a simple first-come cap.
//   Not verifiable against real data with the current single-player test setup
//   anyway.
// - A new unit created via RECRUIT can't yet be given follow-up orders in the
//   same submission (the real engine's "UNIT f06nU01" placeholder-addressing
//   convention) -- needs email-inbound changes to route orders to a
//   not-yet-existing unit_id, out of scope for this pass.
// - New units get an auto-generated name; unit-level NAME (vs. today's
//   faction-level-only NAME) isn't built.
// ---------------------------------------------------------------------------

async function recruitOrder(ctx: TurnContext, state: UnitOrderState, order: ParsedOrder, day: number): Promise<{ status: OrderStatus }> {
  if (!state.unit.is_leader) return { status: 'INVALID' }

  const [targetCode, numberStr, raceTagRaw, priceStr] = order.args
  const raceTag = (raceTagRaw || '').toLowerCase()
  const raceDef = ctx.raceDefsByTag.get(raceTag)
  if (!raceDef) return { status: 'INVALID' }

  const category = raceDef.tag === 'man' ? 'followers' : raceDef.tag === 'ldr' ? 'leaders' : raceDef.tag === 'hero' ? 'heroes' : null
  if (!category) return { status: 'INVALID' } // not one of the standard local-recruit-market races

  const location = ctx.locationsById.get(state.unit.location_id)
  const recruitInfo = location?.economics?.recruits?.[category] as { price: number; amount: number } | undefined
  if (!recruitInfo) return { status: 'INVALID' }

  let price = parseInt(priceStr || '0')
  if (price === 0) price = recruitInfo.price ?? 0
  if (!price || price <= 0) return { status: 'INVALID' }

  const unitMoney = state.unit.money ?? 0
  const requestedNumber = parseInt(numberStr || '0')
  const isAutoAmount = requestedNumber === 0

  if (!isAutoAmount && unitMoney < price * requestedNumber) {
    // Explicit non-zero request the unit can't fully afford -- real engine
    // rejects the whole request outright (isValid() on the full amount),
    // not a partial reduction. Retry next day in case money improves (e.g.
    // a WITHDRAW later in the stack, or on a later day).
    logEvent(
      ctx, day, 'insufficient_funds',
      `${state.unit.name} [${state.unit.unit_code}] cannot afford to recruit ${requestedNumber} ${raceDef.plural} at ${price}/figure (has ${unitMoney})`,
      state.unit.faction_id, state.unit.id, state.unit.location_id
    )
    return { status: 'FAILURE' }
  }

  const affordable = Math.floor(unitMoney / price)
  const wanted = isAutoAmount ? affordable : requestedNumber
  const poolRemaining = recruitInfo.amount ?? 0
  const actualAmount = Math.max(0, Math.min(wanted, poolRemaining, affordable))

  if (actualAmount <= 0) {
    // Nothing recruited today (pool exhausted or nothing affordable). The
    // auto-amount variant always completes after one attempt regardless
    // (see completeOrderProcessing note above); an explicit request retries.
    return { status: isAutoAmount ? 'SUCCESS' : 'FAILURE' }
  }

  // Resolve target: existing unit (same faction/race, not already leader-led)
  // or a brand-new unit stacked beneath the recruiting leader.
  const targetId = ctx.unitCodeToId.get((targetCode || '').toUpperCase())
  let targetState = targetId ? ctx.unitStates.get(targetId) : undefined

  if (targetState) {
    if (targetState.unit.faction_id !== state.unit.faction_id) return { status: 'INVALID' }
    if (targetState.unit.unit_race !== raceDef.tag) return { status: 'INVALID' }
    if (raceDef.category === 'LEADER' && targetState.unit.figure_count >= 1) return { status: 'INVALID' } // one leader per unit
  } else if (targetCode) {
    // New-unit placeholder: any code that doesn't resolve to a real existing
    // unit is treated as "create new" -- simpler than enforcing the real
    // engine's "<faction_code>n<label>" placeholder syntax, and that syntax
    // only mattered for same-submission follow-up addressing, which isn't
    // supported yet anyway (see file header note).
    const newCode = await generateUniqueUnitCode()
    const baseStats = raceDef.base_stats || {}
    const { data: newUnitRow, error: insertError } = await supabase
      .from('units')
      .insert({
        faction_id: state.unit.faction_id,
        location_id: state.unit.location_id,
        unit_code: newCode,
        name: `New ${raceDef.plural ?? raceDef.name}`,
        unit_type: raceDef.category.toLowerCase(),
        unit_race: raceDef.tag,
        is_hero: raceDef.tag === 'hero',
        is_leader: raceDef.category === 'LEADER',
        is_stacked: true,
        stack_leader_id: state.unit.id,
        stack_position: nextStackPosition(ctx, state.unit.location_id), // not explicitly specified, but a recruited unit "arriving" at the location is the same conceptual event as MOVE arrival
        figure_count: 0,
        upkeep_per_figure: baseStats.upkeep ?? 10,
        money: 0,
        initiative: 1, // TODO: not part of race_defs base_stats -- same placeholder gap as hero registration
        melee: 1,
        defense: 1,
        missile: 0,
        life: baseStats.life ?? 1,
        hits: 1,
        damage: 1,
        ranged_damage: 0,
        stealth: 1,
        observation: 1,
        mana_current: 0,
        mana_max: 0,
        attributes: {},
      })
      .select()
      .single()

    if (insertError || !newUnitRow) {
      console.error('RECRUIT: failed to create new unit:', insertError)
      return { status: 'FAILURE' }
    }

    ctx.unitCodeToId.set(newCode, newUnitRow.id)
    targetState = { unit: newUnitRow as UnitRow, orders: [], fullDayOrder: null, dirty: false, recruitedToday: false }
    ctx.unitStates.set(newUnitRow.id, targetState)
  } else {
    return { status: 'INVALID' }
  }

  targetState.unit.figure_count = (targetState.unit.figure_count ?? 0) + actualAmount
  targetState.dirty = true
  state.unit.money = unitMoney - price * actualAmount
  state.dirty = true
  state.recruitedToday = true

  recruitInfo.amount = poolRemaining - actualAmount
  if (location) ctx.dirtyLocationIds.add(location.id)

  logEvent(
    ctx, day, 'unit_recruits',
    `${state.unit.name} [${state.unit.unit_code}] recruits ${actualAmount} ${raceDef.plural} into ${targetState.unit.name} [${targetState.unit.unit_code}] for ${price * actualAmount} coins`,
    state.unit.faction_id, state.unit.id, state.unit.location_id
  )

  if (isAutoAmount) return { status: 'SUCCESS' }

  const remaining = requestedNumber - actualAmount
  if (remaining <= 0) return { status: 'SUCCESS' }

  order.args[1] = String(remaining) // mutated in place -- same object persists in state.orders across days
  return { status: 'FAILURE' }
}

function beginFullDayOrder(
  ctx: TurnContext, state: UnitOrderState, order: ParsedOrder, day: number
): { status: OrderStatus; daysRemaining?: number; data?: FullDayData } {
  if (NOT_YET_IMPLEMENTED_FULL_DAY.has(order.command)) {
    logEvent(
      ctx, day, 'order_pending',
      `${state.unit.name} [${state.unit.unit_code}]: ${order.command} not yet implemented — order held for a later stage`,
      state.unit.faction_id, state.unit.id, state.unit.location_id
    )
    return { status: 'FAILURE' }
  }

  switch (order.command) {
    case 'WORK': {
      if (state.unit.attributes?.guarding) return { status: 'FAILURE' }
      return { status: 'SUCCESS', daysRemaining: order.duration ?? 1, data: { kind: 'none' } }
    }

    case 'STUDY': {
      const skillTag = (order.args[0] || '').toLowerCase()
      const skillDef = ctx.skillDefsByTag.get(skillTag)
      if (!skillDef) return { status: 'INVALID' }

      if (skillDef.leader_only && !state.unit.is_leader) return { status: 'INVALID' }

      const skillRow = ctx.unitSkills.get(state.unit.id)?.get(skillTag)
      const currentLevel = skillRow?.level ?? 0
      const MAX_SKILL_LEVEL = skillDef.level_days?.length ?? 5 // real per-skill max level from skills.rules

      // Per the original engine (StudyOrder::process): if no level is given,
      // the implicit target is always current+1, capped at max — STUDY is
      // never open-ended even without an explicit level argument.
      let targetLevel = order.args[1] ? parseInt(order.args[1]) : currentLevel + 1
      if (targetLevel > MAX_SKILL_LEVEL) targetLevel = MAX_SKILL_LEVEL

      if (currentLevel >= targetLevel) return { status: 'INVALID' } // nothing left to study toward

      if (currentLevel >= SELF_STUDY_MAX_LEVEL) {
        logEvent(
          ctx, day, 'order_pending',
          `${state.unit.name} [${state.unit.unit_code}]: STUDY ${skillTag} beyond level ${SELF_STUDY_MAX_LEVEL} requires a teacher (not yet implemented)`,
          state.unit.faction_id, state.unit.id, state.unit.location_id
        )
        return { status: 'FAILURE' }
      }

      return { status: 'SUCCESS', daysRemaining: order.duration ?? 1, data: { kind: 'study', targetLevel } }
    }

    case 'MOVE': {
      // "The leader will not be able to move during the day he recruits" (RulesNew.txt)
      if (state.recruitedToday) return { status: 'FAILURE' }

      const target = (order.args[0] || '').toUpperCase()
      const location = ctx.locationsById.get(state.unit.location_id)
      const exits = location?.resources?.exits || []

      const fullDirection = DIRECTION_MAP[target]
      const exit = exits.find(e =>
        (fullDirection && e.direction === fullDirection) || e.dest_loc_code === target
      )

      if (!exit || exit.impassable || exit.walk_days === null) return { status: 'INVALID' }
      if (!location) return { status: 'INVALID' } // unreachable in practice -- exit only resolves via location.resources.exits

      const destLocationId = ctx.locCodeToId.get(exit.dest_loc_code)
      if (!destLocationId) return { status: 'INVALID' }

      // Real report format (reference/game-archive/report18.txt): "departs to
      // <dest> [<code>]" plus "Movement will take N days" as two separate
      // lines, logged the day the move begins -- the latter only for moves
      // longer than 1 day (every 1-day-move example in the archive completes
      // same-day with no "Movement will take" line at all).
      logEvent(
        ctx, day, 'unit_departs',
        `${state.unit.name} [${state.unit.unit_code}] departs to ${exit.dest_name} [${exit.dest_loc_code}]`,
        state.unit.faction_id, state.unit.id, state.unit.location_id
      )
      if (exit.walk_days > 1) {
        logEvent(
          ctx, day, 'movement_duration',
          `Movement will take ${exit.walk_days} days`,
          state.unit.faction_id, state.unit.id, state.unit.location_id
        )
      }

      // TODO Stage 2c: check unit's carry weight vs riding/flying capacity
      // (unit_items + item_defs.capacity_ride/capacity_fly) to use exit.ride_days
      // or exit.fly_days instead of walk_days when applicable.
      return {
        status: 'SUCCESS',
        daysRemaining: exit.walk_days,
        data: {
          kind: 'move',
          targetLocationId: destLocationId,
          targetLocCode: exit.dest_loc_code,
          originLocationId: state.unit.location_id,
          originLocCode: location.loc_code,
          originName: location.geographic_name ?? location.loc_code,
        },
      }
    }

    default:
      return { status: 'FAILURE' }
  }
}

function tickFullDayOrder(ctx: TurnContext, state: UnitOrderState, day: number) {
  const active = state.fullDayOrder
  if (!active) return

  switch (active.order.command) {
    case 'WORK': {
      const guarding = !!state.unit.attributes?.guarding
      const location = ctx.locationsById.get(state.unit.location_id)
      const wagePerFigure = location?.economics?.wages ?? 1
      const figures = guarding ? Math.floor(state.unit.figure_count / 2) : state.unit.figure_count
      const earnings = figures * wagePerFigure

      const faction = ctx.factionsById.get(state.unit.faction_id)
      if (faction) faction.funds = (faction.funds || 0) + earnings

      logEvent(
        ctx, day, 'unit_work',
        `${state.unit.name} [${state.unit.unit_code}] works, earning ${earnings} coins${guarding ? ' (half efficiency — guarding)' : ''}`,
        state.unit.faction_id, state.unit.id, state.unit.location_id
      )
      break
    }

    case 'STUDY': {
      const skillTag = (active.order.args[0] || '').toLowerCase()
      const targetLevel = active.data.kind === 'study' ? active.data.targetLevel : null
      const skillDef = ctx.skillDefsByTag.get(skillTag)
      if (!skillDef) break

      // Per the original engine: study cost is per-figure, not a flat daily fee.
      const costPerDay = (skillDef.cost_per_day ?? 1) * state.unit.figure_count
      const faction = ctx.factionsById.get(state.unit.faction_id)

      if (faction && faction.funds >= costPerDay) {
        faction.funds -= costPerDay

        if (!ctx.unitSkills.has(state.unit.id)) ctx.unitSkills.set(state.unit.id, new Map())
        const unitSkillMap = ctx.unitSkills.get(state.unit.id)!
        let skillRow = unitSkillMap.get(skillTag)
        if (!skillRow) {
          skillRow = { unit_id: state.unit.id, skill_tag: skillTag, level: 0, experience_days: 0 }
          unitSkillMap.set(skillTag, skillRow)
        }

        skillRow.experience_days += 1
        ctx.dirtyUnitSkills.add(state.unit.id)

        // Real per-skill progression from skills.rules, not a shared global guess.
        // NOTE: treated as incremental (days needed for *this* level-up), matching
        // how experience_days already resets after each level per the line below --
        // consistent with the app's existing data model, but the source's LEVEL
        // field's cumulative-vs-incremental semantics weren't independently confirmed
        // against the C++ comparison logic itself. Worth double-checking if leveling
        // speed looks off in actual play.
        const neededForNextLevel = skillDef.level_days?.[skillRow.level]

        if (neededForNextLevel !== undefined && skillRow.experience_days >= neededForNextLevel) {
          skillRow.level += 1
          skillRow.experience_days -= neededForNextLevel
          logEvent(
            ctx, day, 'skill_achieved',
            `${state.unit.name} [${state.unit.unit_code}] achieves ${skillRow.level}${ordinalSuffix(skillRow.level)} ${skillDef.name} [${skillTag}]`,
            state.unit.faction_id, state.unit.id, state.unit.location_id
          )
          if (targetLevel !== null && skillRow.level >= targetLevel) {
            active.daysRemaining = 0
            return
          }
        }
      } else {
        logEvent(
          ctx, day, 'insufficient_funds',
          `${state.unit.name} [${state.unit.unit_code}] cannot afford to study ${skillTag} today (need ${costPerDay})`,
          state.unit.faction_id, state.unit.id, state.unit.location_id
        )
      }
      break
    }

    case 'MOVE':
      break

    default:
      break
  }

  active.daysRemaining -= 1
}

function completeFullDayOrder(ctx: TurnContext, state: UnitOrderState, day: number) {
  const active = state.fullDayOrder
  if (!active) return

  if (active.data.kind === 'move') {
    state.unit.location_id = active.data.targetLocationId
    state.unit.stack_position = nextStackPosition(ctx, active.data.targetLocationId)
    state.dirty = true
    // Real report format: "arrived from <origin>" -- names where the unit
    // came from, not the destination it's now at (report18.txt).
    logEvent(
      ctx, day, 'unit_arrived',
      `${state.unit.name} [${state.unit.unit_code}] arrived from ${active.data.originName} [${active.data.originLocCode}]`,
      state.unit.faction_id, state.unit.id, active.data.targetLocationId
    )
  }

  if (active.order.repeat) {
    state.orders.unshift({ ...active.order })
  }

  state.fullDayOrder = null
}

function ordinalSuffix(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function processTurn(gameId: string): Promise<{
  turnNumber: number
  registrations: { created: number; skipped: string[] }
  eventCount: number
  reportsSent: string[]
  reportErrors: string[]
}> {
  const { data: game, error: gameError } = await supabase.from('games').select('*').eq('id', gameId).single()
  if (gameError || !game) throw new Error(`Game not found: ${gameError?.message}`)

  const registrations = await processPendingRegistrations(gameId, game.turn_number)
  const ctx = await buildTurnContext(gameId, game.turn_number)

  for (let day = 1; day <= DAYS_PER_TURN; day++) {
    // NOTE: ctx.unitStates can gain new entries mid-iteration (RECRUIT
    // creating a new unit) -- Map iteration reflects those insertions, which
    // just means a brand-new unit gets a harmless no-op processUnitDay call
    // the same day it's created (empty orders array), then processes
    // normally from the next day on.
    for (const state of ctx.unitStates.values()) {
      await processUnitDay(ctx, state, day)
    }
    // Battles, markets, mana, effects — Stage 3/4.
  }

  for (const faction of ctx.factionsById.values()) {
    await supabase.from('factions').update({ funds: faction.funds }).eq('id', faction.id)
  }

  for (const state of ctx.unitStates.values()) {
    const attrs = { ...(state.unit.attributes || {}) }
    delete attrs.guarding
    await supabase
      .from('units')
      .update({
        location_id: state.unit.location_id,
        attributes: attrs,
        pending_orders: state.orders,
        active_full_day_order: state.fullDayOrder,
        figure_count: state.unit.figure_count,
        money: state.unit.money,
        stack_position: state.unit.stack_position,
      })
      .eq('id', state.unit.id)
  }

  // Persist depleted recruit pools -- RECRUIT mutates location.economics.recruits
  // in memory (ctx.locationsById is shared across the whole turn's processing,
  // so depletion correctly carries across days/units within the turn); without
  // this it would never actually save, and the pool would silently "refill"
  // every new turn.
  for (const locationId of ctx.dirtyLocationIds) {
    const location = ctx.locationsById.get(locationId)
    if (!location) continue
    await supabase.from('locations').update({ economics: location.economics }).eq('id', locationId)
  }

  for (const unitId of ctx.dirtyUnitSkills) {
    const skillMap = ctx.unitSkills.get(unitId)
    if (!skillMap) continue
    for (const skillRow of skillMap.values()) {
      if (skillRow.id) {
        await supabase.from('unit_skills').update({ level: skillRow.level, experience_days: skillRow.experience_days }).eq('id', skillRow.id)
      } else {
        await supabase.from('unit_skills').insert({
          unit_id: skillRow.unit_id,
          skill_tag: skillRow.skill_tag,
          level: skillRow.level,
          experience_days: skillRow.experience_days,
          token_progress: 0,
        })
      }
    }
  }

  if (ctx.eventLog.length > 0) {
    const { error: eventInsertError } = await supabase.from('turn_events').insert(ctx.eventLog)
    if (eventInsertError) {
      // Never silently swallow this again -- this exact bug (real schema
      // didn't match assumed columns) went undetected for a long time
      // because this insert's error was never checked.
      console.error('turn_events insert failed:', eventInsertError)
    }
  }

  // NOTE: wages/upkeep/desertion and outlaw spawning are still stubbed — Stage 4b.

  const reportsSent: string[] = []
  const reportErrors: string[] = []

  const activeFactions = Array.from(ctx.factionsById.values()).filter(f => !f.is_npc)
  const playerIds = activeFactions.map(f => f.player_id).filter((id): id is string => !!id)

  const { data: players } = playerIds.length > 0
    ? await supabase.from('players').select('id, email').in('id', playerIds)
    : { data: [] as { id: string; email: string }[] }
  const emailByPlayerId = new Map((players || []).map(p => [p.id, p.email]))

  for (const faction of activeFactions) {
    const email = faction.player_id ? emailByPlayerId.get(faction.player_id) : null
    if (!email) {
      reportErrors.push(`${faction.faction_code}: no player email on file, report not sent`)
      continue
    }
    try {
      const report = await generateTurnReport(faction.id)
      await sendEmail({
        to: email,
        subject: `New Overlord — Turn ${ctx.turnNumber} Report [${faction.faction_code}]`,
        text: report,
      })
      reportsSent.push(faction.faction_code)
    } catch (err: any) {
      console.error(`Report generation/send failed for ${faction.faction_code}:`, err)
      reportErrors.push(`${faction.faction_code}: ${err.message}`)
    }
  }

  await supabase.from('games').update({ turn_number: game.turn_number + 1 }).eq('id', gameId)

  return {
    turnNumber: game.turn_number,
    registrations,
    eventCount: ctx.eventLog.length,
    reportsSent,
    reportErrors,
  }
}