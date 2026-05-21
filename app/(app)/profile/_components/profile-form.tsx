'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/app/(app)/_components/avatar'
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'

type ProfileFormData = {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
}

type Message = { type: 'success' | 'error'; text: string }

export function ProfileForm({ profile }: { profile: ProfileFormData }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(profile.display_name)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  // Revoke the local preview URL when it changes or on unmount.
  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  function handleAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }
    setAvatarPreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev)
      }
      return URL.createObjectURL(file)
    })
    setAvatarFile(file)
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!displayName.trim()) {
      setMessage({ type: 'error', text: 'Display name is required.' })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be signed in to edit your profile.')
      }

      let avatarUrl: string | undefined
      if (avatarFile) {
        const blob = await convertToJpg(avatarFile)
        const path = `${user.id}/avatar.jpg`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (uploadError) {
          throw uploadError
        }

        const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data
          .publicUrl
        avatarUrl = `${publicUrl}?v=${Date.now()}`
      }

      const update: {
        display_name: string
        bio: string
        avatar_url?: string
      } = {
        display_name: displayName.trim(),
        bio: bio.trim(),
      }
      if (avatarUrl) {
        update.avatar_url = avatarUrl
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user.id)
      if (updateError) {
        throw updateError
      }

      router.refresh()
      setMessage({ type: 'success', text: 'Saved' })
    } catch (err) {
      console.error('Failed to save profile:', err)
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="flex items-center gap-4">
        {avatarPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarPreview}
            alt={displayName}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar url={profile.avatar_url} name={displayName} size="lg" />
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Change photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarPicked}
          className="hidden"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Display name *
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder="Tell people about yourself"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </label>

      {message && (
        <p
          className={`text-sm ${
            message.type === 'success' ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
