'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

type Message = { type: 'success' | 'error'; text: string }

export function ChangePasswordButton({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<Message | null>(null)

  function handleClick() {
    setMessage(null)
    startTransition(async () => {
      if (!email) {
        setMessage({
          type: 'error',
          text: 'No email is associated with this account.',
        })
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
        return
      }

      setMessage({
        type: 'success',
        text: 'Check your email for a password reset link. It may take a minute to arrive.',
      })
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
      >
        {isPending ? 'Sending…' : 'Change password'}
      </button>

      {message && (
        <p
          className={`text-sm ${
            message.type === 'success' ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
