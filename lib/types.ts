export interface Profile {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  created_at: string
  is_admin: boolean
}

export interface Post {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
}

export interface PostImage {
  id: string
  post_id: string
  url: string
  storage_path: string
  position: number
  created_at: string | null
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
}

export type PostWithRelations = Post & {
  author: Profile
  images: PostImage[]
  comment_count: number
}

export type PostWithFullRelations = Post & {
  author: Profile
  images: PostImage[]
  comments: (Comment & { author: Profile })[]
}

export type ProfileWithPosts = Profile & {
  posts: Pick<Post, 'id' | 'title' | 'body' | 'created_at' | 'author_id'>[]
}
