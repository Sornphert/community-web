'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    startTransition(async () => {
      const supabase = createClient()
      // Ignore the returned error: always show the same neutral success message
      // so the response never reveals whether an account exists for this email
      // (account-enumeration prevention).
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setSent(true)
    })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center bg-[#010822] px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-4 mb-8">
            <Image
              src="/brand.jpg"
              alt="Johnson 天命数字投资"
              width={120}
              height={120}
              className="rounded shrink-0"
            />
            <h2 className="font-semibold text-zinc-900 text-xl leading-tight text-center">
              Johnson 天命数字投资
            </h2>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-zinc-900 text-center">
              Forgot your password?
            </h1>
            <p className="mt-1 text-sm text-zinc-500 text-center">忘记密码？</p>
          </div>

          {sent ? (
            <div className="flex flex-col gap-4">
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Check your email for a password reset link. It may take a minute
                to arrive.
              </p>
              <Link
                href="/login"
                className="text-center text-sm text-zinc-500 hover:text-zinc-700"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />
              </label>

              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {isPending ? 'Sending…' : 'Send reset link 发送重置链接'}
              </button>

              <Link
                href="/login"
                className="text-center text-sm text-zinc-500 hover:text-zinc-700"
              >
                ← Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
