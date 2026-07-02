'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PLATFORM_NAME, PLATFORM_LOGO_URL } from '@/lib/config'

type Status = 'checking' | 'ready' | 'invalid'
type Message = { type: 'success' | 'error'; text: string }

const MIN_PASSWORD_LENGTH = 6

export default function ResetPasswordPage() {
  const router = useRouter()

  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<Message | null>(null)
  const [isPending, startTransition] = useTransition()

  // The /auth/confirm route exchanges the recovery token for a session before
  // redirecting here, so a valid recovery link means getUser() returns a user.
  // No user = direct navigation or an expired/invalid link.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setStatus(user ? 'ready' : 'invalid')
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage({
        type: 'error',
        text: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      })
      return
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setMessage({ type: 'error', text: error.message })
        return
      }

      setMessage({
        type: 'success',
        text: 'Password updated successfully. Redirecting…',
      })
      setTimeout(() => router.push('/community'), 2000)
    })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center bg-[#010822] px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-4 mb-8">
            <Image
              src={PLATFORM_LOGO_URL}
              alt={PLATFORM_NAME}
              width={120}
              height={120}
              className="h-[120px] w-[120px] rounded object-contain shrink-0"
            />
            <h2 className="font-semibold text-zinc-900 text-xl leading-tight text-center">
              {PLATFORM_NAME}
            </h2>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-zinc-900 text-center">
              Set new password
            </h1>
          </div>

          {status === 'checking' && (
            <p className="text-center text-sm text-zinc-500">Loading…</p>
          )}

          {status === 'invalid' && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              This link is invalid or expired. Please request a new password
              reset link from your profile.
            </p>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                Confirm new password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />
              </label>

              {message && (
                <p
                  className={`rounded-md px-3 py-2 text-sm ${
                    message.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {isPending ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
