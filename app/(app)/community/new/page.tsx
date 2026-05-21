import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NewPostForm } from './_components/new-post-form'

export default async function NewPostPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/community"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to community
      </Link>

      <h1 className="mb-4 text-xl font-semibold text-zinc-900">New Post</h1>

      <NewPostForm />
    </div>
  )
}
