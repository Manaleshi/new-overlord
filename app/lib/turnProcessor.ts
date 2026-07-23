// app/lib/turnProcessor.ts
//
// STAGE 2: rebuilt day-loop to match the original engine's semantics
// (confirmed against Alex Dribin's 2010 C++ source: OrderProcessor.cpp,
// OrderLine.cpp). Adds STUDY and MOVE (walking only — riding/flying
// capacity deferred to Stage 2c pending unit_items/item_defs wiring).
//
// Orders implemented: NAME, PASSWORD (faction), GUARD, WORK, STUDY, MOVE (unit)
// Orders recognized but NOT yet implemented: RECRUIT, GIVE, USE, MARCH,
// and everything else in RulesNew.txt (TEACH, EQUIP, SPLIT, ENTER/LEAVE, etc.)
// — these log an `order_pending` event and stay queued, untouched, for a
// later stage rather than being silently dropped.
//
// Still NOT done here: wages/upkeep/desertion at month-end, outlaw spawning,
// report generation/emailing, turn_number increment. Stage 4.

import { supabase } from './supabase'
import bcrypt from 'bcryptjs'
import type { ParsedOrder } from './orderParser'
import { generateTurnReport } from './turnReport'
import { sendEmail } from './email'

const DAYS_PER_TURN = 30
const SKILL_LEVEL_DAYS = [15, 45, 90, 180, 360] // days required for level 1..5 (TODO: confirm this is universal, not per-skill, with Andy)
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
  is_leader: boolean
  figure_count: number
  upkeep_per_figure: number
  attributes: Record<string, any> | null
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
  | { kind: 'move'; targetLocationId: string; targetLocCode: string }
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
}

interface TurnContext {
  gameId: string
  turnNumber: number
  factionsById: Map<string, FactionRow>
  locationsById: Map<string, LocationRow>
  locCodeToId: Map<string, string>
  skillDefsByTag: Map<string, SkillDefRow>
  unitSkills: Map<string, Map<string, UnitSkillRow>> // unitId -> tag -> row
  dirtyUnitSkills: Set<string>
  unitStates: Map<string, UnitOrderState>
  eventLog: { turn_number: number; game_id: string; event_type: string; description: string; location_id: string | null; faction_id: string | null }[]
}

type OrderStatus = 'SUCCESS' | 'FAILURE' | 'INVALID' | 'IN_PROGRESS'

function logEvent(
  ctx: TurnContext,
  event_type: string,
  description: string,
  faction_id: string | null = null,
  location_id: string | null = null
) {
  ctx.eventLog.push({ turn_number: ctx.turnNumber, game_id: ctx.gameId, event_type, description, location_id, faction_id })
}

// ---------------------------------------------------------------------------
// Registration processing (unchanged from Stage 1)
// ---------------------------------------------------------------------------

export async function processPendingRegistrations(gameId: string): Promise<{ created: number; skipped: string[] }> {
  const skipped: string[] = []
  let created = 0

  const { data: pendingPlayers, error } = await supabase.from('players').select('*').eq('status', 'pending')
  if (error) throw new Error(`Failed to load pending players: ${error.message}`)
  if (!pendingPlayers || pendingPlayers.length === 0) return { created: 0, skipped: [] }

  for (const player of pendingPlayers) {
    const startingLocationId = player.attributes?.starting_location
    if (!startingLocationId) {
      skipped.push(`${player.email}: no starting_location assigned yet — run GM admin assignment first`)
      continue
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
        joined_turn: null,
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
      upkeep_per_figure: 5, // TODO confirm with Andy
      initiative: 2,
      melee: 1,
      defense: 1,
      missile: 0,
      life: 4,
      hits: 4,
      damage: 1,
      ranged_damage: 0,
      stealth: 1,
      observation: 4,
      mana_current: 0,
      mana_max: 0,
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

  const { data: locations, error: locationsError } = await supabase.from('locations').select('*')
  if (locationsError) throw new Error(`Failed to load locations: ${locationsError.message}`)
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

  const factionIds = Array.from(factionsById.keys())
  const safeFactionIds = factionIds.length > 0 ? factionIds : ['00000000-0000-0000-0000-000000000000']

  const { data: units, error: unitsError } = await supabase.from('units').select('*').in('faction_id', safeFactionIds)
  if (unitsError) throw new Error(`Failed to load units: ${unitsError.message}`)

  const unitIds = (units || []).map(u => u.id)

  // Chunked to avoid Supabase's URL length limit on large .in() lists —
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
    gameId, turnNumber, factionsById, locationsById, locCodeToId,
    skillDefsByTag, unitSkills, dirtyUnitSkills: new Set(),
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
    const orders = ordersByUnitId.get(unit.id) || []
    ctx.unitStates.set(unit.id, {
      unit,
      orders: orders.map(o => ({ ...o })),
      fullDayOrder: null,
      dirty: false,
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
      logEvent(ctx, 'faction_renamed', `Faction ${faction.faction_code} renamed to "${newName}"`, faction.id)
      break
    }
    case 'PASSWORD': {
      const newPassword = order.args[0]
      if (!newPassword) break
      const hash = await bcrypt.hash(newPassword, 10)
      await supabase.from('players').update({ password_hash: hash }).eq('id', faction.player_id)
      logEvent(ctx, 'password_changed', `Faction ${faction.faction_code} changed password`, faction.id)
      break
    }
    default:
      logEvent(ctx, 'order_pending', `Faction order ${order.command} not yet implemented`, faction.id)
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

const FULL_DAY_COMMANDS = new Set(['WORK', 'STUDY', 'MOVE', 'MARCH', 'RECRUIT', 'GIVE', 'USE'])
const NOT_YET_IMPLEMENTED_FULL_DAY = new Set(['MARCH', 'RECRUIT', 'GIVE', 'USE'])

function processUnitDay(ctx: TurnContext, state: UnitOrderState, day: number) {
  if (state.fullDayOrder) {
    tickFullDayOrder(ctx, state, day)
    if (!state.fullDayOrder || state.fullDayOrder.daysRemaining <= 0) {
      completeFullDayOrder(ctx, state)
    }
    return
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
        completeFullDayOrder(ctx, state)
      }
      return
    }

    const outcome = executeImmediateOrder(ctx, state, order, day)

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

function executeImmediateOrder(ctx: TurnContext, state: UnitOrderState, order: ParsedOrder, day: number): { status: OrderStatus } {
  switch (order.command) {
    case 'GUARD': {
      state.unit.attributes = { ...(state.unit.attributes || {}), guarding: true }
      state.dirty = true
      logEvent(ctx, 'unit_guard', `${state.unit.name} [${state.unit.unit_code}] takes up guard duty`, state.unit.faction_id, state.unit.location_id)
      return { status: 'SUCCESS' }
    }
    default:
      return { status: 'FAILURE' }
  }
}

function beginFullDayOrder(
  ctx: TurnContext, state: UnitOrderState, order: ParsedOrder, day: number
): { status: OrderStatus; daysRemaining?: number; data?: FullDayData } {
  if (NOT_YET_IMPLEMENTED_FULL_DAY.has(order.command)) {
    logEvent(
      ctx, 'order_pending',
      `${state.unit.name} [${state.unit.unit_code}]: ${order.command} not yet implemented — order held for a later stage`,
      state.unit.faction_id, state.unit.location_id
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
      const stopLevel = order.args[1] ? parseInt(order.args[1]) : null
      const skillDef = ctx.skillDefsByTag.get(skillTag)
      if (!skillDef) return { status: 'INVALID' }

      if (skillDef.leader_only && !state.unit.is_leader) return { status: 'INVALID' }

      const skillRow = ctx.unitSkills.get(state.unit.id)?.get(skillTag)
      const currentLevel = skillRow?.level ?? 0

      if (currentLevel >= SELF_STUDY_MAX_LEVEL) {
        logEvent(
          ctx, 'order_pending',
          `${state.unit.name} [${state.unit.unit_code}]: STUDY ${skillTag} beyond level ${SELF_STUDY_MAX_LEVEL} requires a teacher (not yet implemented)`,
          state.unit.faction_id, state.unit.location_id
        )
        return { status: 'FAILURE' }
      }

      if (stopLevel !== null && currentLevel >= stopLevel) return { status: 'INVALID' }

      return { status: 'SUCCESS', daysRemaining: order.duration ?? 1, data: { kind: 'none' } }
    }

    case 'MOVE': {
      const target = (order.args[0] || '').toUpperCase()
      const location = ctx.locationsById.get(state.unit.location_id)
      const exits = location?.resources?.exits || []

      const fullDirection = DIRECTION_MAP[target]
      const exit = exits.find(e =>
        (fullDirection && e.direction === fullDirection) || e.dest_loc_code === target
      )

      if (!exit || exit.impassable || exit.walk_days === null) return { status: 'INVALID' }

      const destLocationId = ctx.locCodeToId.get(exit.dest_loc_code)
      if (!destLocationId) return { status: 'INVALID' }

      // TODO Stage 2c: check unit's carry weight vs riding/flying capacity
      // (unit_items + item_defs.capacity_ride/capacity_fly) to use exit.ride_days
      // or exit.fly_days instead of walk_days when applicable.
      return {
        status: 'SUCCESS',
        daysRemaining: exit.walk_days,
        data: { kind: 'move', targetLocationId: destLocationId, targetLocCode: exit.dest_loc_code },
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
        ctx, 'unit_work',
        `${state.unit.name} [${state.unit.unit_code}] works, earning ${earnings} coins${guarding ? ' (half efficiency — guarding)' : ''}`,
        state.unit.faction_id, state.unit.location_id
      )
      break
    }

    case 'STUDY': {
      const skillTag = (active.order.args[0] || '').toLowerCase()
      const stopLevel = active.order.args[1] ? parseInt(active.order.args[1]) : null
      const skillDef = ctx.skillDefsByTag.get(skillTag)
      if (!skillDef) break

      const costPerDay = skillDef.cost_per_day ?? 1
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

        const neededForNextLevel = SKILL_LEVEL_DAYS[skillRow.level]
        if (neededForNextLevel !== undefined && skillRow.experience_days >= neededForNextLevel) {
          skillRow.level += 1
          skillRow.experience_days -= neededForNextLevel
          logEvent(
            ctx, 'skill_achieved',
            `${state.unit.name} [${state.unit.unit_code}] achieves ${skillRow.level}${ordinalSuffix(skillRow.level)} ${skillDef.name} [${skillTag}]`,
            state.unit.faction_id, state.unit.location_id
          )
          if (stopLevel !== null && skillRow.level >= stopLevel) {
            active.daysRemaining = 0
            return
          }
        }
      } else {
        logEvent(
          ctx, 'insufficient_funds',
          `${state.unit.name} [${state.unit.unit_code}] cannot afford to study ${skillTag} today (need ${costPerDay})`,
          state.unit.faction_id, state.unit.location_id
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

function completeFullDayOrder(ctx: TurnContext, state: UnitOrderState) {
  const active = state.fullDayOrder
  if (!active) return

  if (active.data.kind === 'move') {
    state.unit.location_id = active.data.targetLocationId
    state.dirty = true
    logEvent(
      ctx, 'unit_arrived',
      `${state.unit.name} [${state.unit.unit_code}] arrives at ${active.data.targetLocCode}`,
      state.unit.faction_id, active.data.targetLocationId
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

  const registrations = await processPendingRegistrations(gameId)
  const ctx = await buildTurnContext(gameId, game.turn_number)

  for (let day = 1; day <= DAYS_PER_TURN; day++) {
    for (const state of ctx.unitStates.values()) {
      processUnitDay(ctx, state, day)
    }
    // Battles, markets, recruits, mana, effects — Stage 3/4.
  }

  for (const faction of ctx.factionsById.values()) {
    await supabase.from('factions').update({ funds: faction.funds }).eq('id', faction.id)
  }

  for (const state of ctx.unitStates.values()) {
    const attrs = { ...(state.unit.attributes || {}) }
    delete attrs.guarding
    await supabase
      .from('units')
      .update({ location_id: state.unit.location_id, attributes: attrs })
      .eq('id', state.unit.id)
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
    await supabase.from('turn_events').insert(ctx.eventLog)
  }

  // NOTE: wages/upkeep/desertion and outlaw spawning are still stubbed — Stage 4b.
  // Report generation/emailing and the turn_number increment below close the loop.

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
