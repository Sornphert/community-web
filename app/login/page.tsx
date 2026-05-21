'use client'

import { Suspense, useState, useTransition } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { signIn, signUp } from './actions'

type Mode = 'signin' | 'signup'

function LoginForm() {
  const searchParams = useSearchParams()
  const message = searchParams.get('message')

  const [mode, setMode] = useState<Mode>('signin')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const action = mode === 'signin' ? signIn : signUp
      // On success the action redirects, so nothing is returned.
      const result = await action(formData)
      setError(result?.error ?? null)
    })
  }

  function toggleMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setError(null)
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
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

        <h1 className="mb-6 text-xl font-semibold text-zinc-900">
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </h1>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </label>

          {message && (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
              {message}
            </p>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-900"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
