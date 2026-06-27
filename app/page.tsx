import { supabase } from './lib/supabase'

export default async function Home() {
  const { data, error } = await supabase.from('games').select('*')
  
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">New Overlord</h1>
      {error ? (
        <p className="text-red-500">Connection error: {error.message}</p>
      ) : (
        <p className="text-green-500">Supabase connected! Games in database: {data?.length ?? 0}</p>
      )}
    </main>
  )
}