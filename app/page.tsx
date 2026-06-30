import { supabase } from './lib/supabase'
import { generateWorld } from './lib/worldGenerator'
import WorldMap from './components/WorldMap'
import { revalidatePath } from 'next/cache'

async function createNewWorld() {
  'use server'
  await supabase.from('locations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('worlds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await generateWorld('Alpha', 50, 50)
  revalidatePath('/')
}

async function fetchAllLocations() {
  let allLocations: any[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('locations')
      .select('loc_code, terrain_type, population, resources')
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

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">New Overlord</h1>
        <form action={createNewWorld}>
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            ↻ Regenerate World
          </button>
        </form>
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

      {games && games.length > 0 && (
        <div className="mb-4 text-sm text-gray-500">
          Game: {games[0].name} — Turn {games[0].turn_number} — {games[0].status}
        </div>
      )}
    </main>
  )
}