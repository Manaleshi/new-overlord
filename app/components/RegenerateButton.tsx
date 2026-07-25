'use client'

import { useFormStatus } from 'react-dom'

export default function RegenerateButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        pending
          ? 'bg-blue-400 text-white px-6 py-2 rounded cursor-wait flex items-center gap-2'
          : 'bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 flex items-center gap-2'
      }
    >
      {pending ? (
        <>
          <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          Regenerating world...
        </>
      ) : (
        <>↻ Regenerate World</>
      )}
    </button>
  )
}