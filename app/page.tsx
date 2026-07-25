import { supabase } from './lib/supabase'
import { generateWorld } from './lib/worldGenerator'
import WorldMap from './components/WorldMap'
import RegenerateButton from './components/RegenerateButton'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function createNewWorld() {
  'use server'

  const { data: existingGames } = await supabase.from('games').select('id, is_locked').limit(1)
  if (existingGames && existingGames.length > 0 && existingGames[0].is_locked) {
    throw new Error('World is locked. Unlock it first before regenerating.')
  }

  await supabase.from('unit_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('unit_skills').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('units').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('faction_titles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('factions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('turn_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('structures').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('locations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('worlds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await generateWorld('Alpha', 50, 50)
  revalidatePath('/')
  redirect('/')
}

async function toggleLock(formData: FormData) {
  'use server'
  const gameId = formData.get('gameId') as string
  const currentlyLocked = formData.get('currentlyLocked') === 'true'
 await supabase.from('games').update({ is_locked: !currentlyLocked }).eq('id', gameId)
  revalidatePath('/')
  redirect('/')
}

async function fetchAllLocations() {
  let allLocations: any[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('locations')
      .select('loc_code, terrain_type, population, resources, geographic_name, economics, grid_x, grid_y')
      .range(from, from + batchSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    allLocations = allLocations.concat(data)
    if (data.length < batchSize) break
    from += batchSize
  }

  return allLocations
}

export default async function Home() {
  const { data: games } = await supabase.from('games').select('*')
  const locations = await fetchAllLocations()
  const currentGame = games && games.length > 0 ? games[0] : null
  const isLocked = currentGame?.is_locked ?? false

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">New Overlord</h1>
        <div className="flex items-center gap-3">
          {currentGame && (
            <form action={toggleLock}>
              <input type="hidden" name="gameId" value={currentGame.id} />
              <input type="hidden" name="currentlyLocked" value={String(isLocked)} />
              <button
                type="submit"
                className={
                  isLocked
                    ? 'bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 text-sm'
                    : 'bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 text-sm'
                }
              >
                {isLocked ? '🔒 World Locked — Click to Unlock' : '🔓 Unlocked — Click to Lock'}
              </button>
            </form>
          )}

          {isLocked ? (
            <button
              type="button"
              disabled
              title="Unlock the world first before regenerating"
              className="bg-gray-300 text-gray-500 px-6 py-2 rounded cursor-not-allowed"
            >
              ↻ Regenerate World
            </button>
          ) : (
            <form action={createNewWorld}>
              <RegenerateButton />
            </form>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">World Map</h2>
        {locations && locations.length > 0 ? (
          <WorldMap locations={locations as any} />
        ) : (
          <div className="text-gray-500 p-8 border rounded text-center">
            No world generated yet. Click Regenerate World to start.
          </div>
        )}
      </div>

      {currentGame && (
        <div className="mb-4 text-sm text-gray-500">
          Game: {currentGame.name} — Turn {currentGame.turn_number} — {currentGame.status}
          {isLocked && <span className="ml-2 text-amber-600 font-medium">🔒 Locked</span>}
        </div>
      )}
    </main>
  )
}