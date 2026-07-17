export default function SuccessPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to New Overlord!</h1>
        <p className="text-gray-600 mb-4">
          Your faction has been created and your starting location assigned.
          Your first turn report will arrive by email when the game begins.
        </p>
        <p className="text-gray-500 text-sm">
          Watch your inbox for further instructions from the Game Master.
        </p>
      </div>
    </main>
  )
}