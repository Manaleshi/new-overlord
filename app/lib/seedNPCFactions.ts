import { supabase } from './supabase'

export async function seedNPCFactions(gameId: string) {
  const factions = [
    {
      game_id: gameId,
      player_id: null,
      faction_code: 'F001',
      name: 'The Imperials',
      faction_type: 'imperial',
      is_npc: true,
      funds: 999999,
      control_points_max: 9999,
      status: 'active',
      joined_turn: 0,
      stances: { default: 'friendly', specific: { F002: 'ally', F003: 'enemy', F004: 'enemy', F005: 'friendly' } },
      attributes: { description: 'Controls the Imperial City and surrounding lands' }
    },
    {
      game_id: gameId,
      player_id: null,
      faction_code: 'F002',
      name: 'The Citizens',
      faction_type: 'citizens',
      is_npc: true,
      funds: 999999,
      control_points_max: 9999,
      status: 'active',
      joined_turn: 0,
      stances: { default: 'friendly', specific: { F001: 'ally', F003: 'enemy', F004: 'enemy', F005: 'friendly' } },
      attributes: { description: 'Represents the bulk of the population' }
    },
    {
      game_id: gameId,
      player_id: null,
      faction_code: 'F003',
      name: 'Creatures',
      faction_type: 'creatures',
      is_npc: true,
      funds: 0,
      control_points_max: 9999,
      status: 'active',
      joined_turn: 0,
      stances: { default: 'enemy', specific: {} },
      attributes: { description: 'Wild units that attack on sight' }
    },
    {
      game_id: gameId,
      player_id: null,
      faction_code: 'F004',
      name: 'The Outlaws',
      faction_type: 'outlaws',
      is_npc: true,
      funds: 0,
      control_points_max: 9999,
      status: 'active',
      joined_turn: 0,
      stances: { default: 'enemy', specific: { F003: 'neutral' } },
      attributes: { description: 'Hostile brigands and raiders' }
    },
    {
      game_id: gameId,
      player_id: null,
      faction_code: 'F005',
      name: 'The Merchants',
      faction_type: 'merchants',
      is_npc: true,
      funds: 999999,
      control_points_max: 9999,
      status: 'active',
      joined_turn: 0,
      stances: { default: 'friendly', specific: { F003: 'neutral', F004: 'neutral' } },
      attributes: { description: 'Trade guilds and merchant caravans' }
    },
  ]

  const { error } = await supabase.from('factions').insert(factions)
  if (error) throw error

  return { factionsCreated: factions.length }
}