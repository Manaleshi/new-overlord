import { supabase } from './lib/supabase'
import { generateWorld } from './lib/worldGenerator'
import WorldMap from './components/WorldMap'

async function createTestWorld() {
  'use server'
  await generateWorld('Alpha', 20, 20)
}

export default async function Home() {
  const { data: games } = await supabase.from('games').select('*')
  const { data: locations } = await supabase
    .from('locations')
    .select('loc_code, terrain_type, population')
    .limit(400)

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">New Overlord</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">World Map</h2>
        {locations && locations.length > 0 ? (
          <WorldMap locations={locations} />
        ) : (
          <p className="text-gray-500">No world generated yet.</p>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Games</h2>
        {games && games.length > 0 ? (
          <ul className="space-y-2">
            {games.map((game: any) => (
              <li key={game.id} className="p-3 border rounded">
                {game.name} — Turn {game.turn_number} — {game.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No games yet.</p>
        )}
      </div>

      <form action={createTestWorld}>
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Generate Test World (20x20)
        </button>
      </form>
    </main>
  )
}