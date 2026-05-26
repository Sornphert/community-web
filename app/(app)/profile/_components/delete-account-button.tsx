'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { deleteMyAccount } from '../actions'

export function DeleteAccountButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openModal() {
    setConfirmText('')
    setError(null)
    setShowModal(true)
  }

  // Don't let the user close mid-delete (backdrop click would otherwise be lost).
  function closeModal() {
    if (isPending) return
    setShowModal(false)
  }

  // Close on Escape (but not while a delete is in flight).
  useEffect(() => {
    if (!showModal) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) setShowModal(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showModal, isPending])

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteMyAccount()

      if (res.ok) {
        // Session is already gone; /login is public. The query param lets the
        // login page show a one-time "account deleted" message.
        router.push('/login?deleted=1')
        return
      }

      if (res.error === 'is_admin') {
        setError(
          "You're an admin. Please demote yourself first via another admin before deleting.",
        )
      } else if (res.error === 'storage_cleanup_failed') {
        setError(
          "Your account was deleted but some files couldn't be cleaned up. Please contact admin.",
        )
      } else {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="self-start rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        Delete account
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Delete your account?
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                aria-label="Close"
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
              <div className="text-sm text-zinc-600">
                <p>This will permanently delete your account, including:</p>
                <ul className="mt-2 list-disc pl-5">
                  <li>Your profile, avatar, and bio</li>
                  <li>Your completion progress on recordings and documents</li>
                  <li>Your uploaded images</li>
                </ul>
                <p className="mt-3">
                  Your posts and comments will be kept but shown as{' '}
                  <span className="font-medium text-zinc-900">
                    [Deleted user]
                  </span>
                  . Once deleted, you cannot recover this account.
                </p>
              </div>

              <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
                To confirm, type DELETE below
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={isPending}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                />
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isPending}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={confirmText !== 'DELETE' || isPending}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? 'Deleting…' : 'Delete account permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
