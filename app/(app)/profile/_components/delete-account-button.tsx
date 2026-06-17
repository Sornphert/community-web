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
        className="self-start rounded-md border border-danger-border px-4 py-2 text-sm font-medium text-danger-text transition-colors hover:bg-danger-subtle disabled:opacity-50"
      >
        Delete account
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-fg">
                Delete your account?
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                aria-label="Close"
                className="rounded p-1 text-fg-faint hover:bg-muted hover:text-fg-secondary disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
              <div className="text-sm text-fg-soft">
                <p>This will permanently delete your account, including:</p>
                <ul className="mt-2 list-disc pl-5">
                  <li>Your profile, avatar, and bio</li>
                  <li>Your completion progress on recordings and documents</li>
                  <li>Your uploaded images</li>
                </ul>
                <p className="mt-3">
                  Your posts and comments will be kept but shown as{' '}
                  <span className="font-medium text-fg">
                    [Deleted user]
                  </span>
                  . Once deleted, you cannot recover this account.
                </p>
              </div>

              <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
                To confirm, type DELETE below
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={isPending}
                  className="rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
              </label>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isPending}
                  className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={confirmText !== 'DELETE' || isPending}
                  className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
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
