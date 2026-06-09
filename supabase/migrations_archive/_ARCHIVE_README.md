# ⛔ ARCHIVED MIGRATIONS — DO NOT RUN ON NEW PROJECTS

These files (`0002`–`0011`) are the **historical migration chain that was already
applied, by hand, to the production Supabase project**
(`eesyjkmmyiisuaghhota`). They are kept only as a record of how prod evolved.

## Do NOT run these on a fresh project

A new Supabase project is stood up from the **canonical snapshot**, not this
chain:

```
supabase/bootstrap/schema.sql   # full current schema (already includes 0002–0011)
supabase/seed.sql               # channels, classroom folders/recordings, buckets, recordings topic
```

Running `bootstrap/schema.sql` **and then** these migrations would double-apply
everything and fail. The two are mutually exclusive paths:

| Target                | What to run                                   |
| --------------------- | --------------------------------------------- |
| **Fresh project**     | `bootstrap/schema.sql` → `seed.sql`           |
| **Existing prod**     | Nothing — it already has `0002`–`0011`        |

## Why these aren't a clean migration chain anyway

- There is **no `0000`/`0001`**. The base schema (`profiles`, `posts`,
  `post_images`, `comments`, `topics`, `content_items`, `content_progress`,
  their RLS, the `handle_new_user` trigger, and the original storage buckets)
  was created directly in the Supabase dashboard and never captured as a file.
- Several files explicitly depend on dashboard-only objects (e.g.
  `0002` notes "the original INSERT policy was created outside these migration
  files").

The folder was renamed from `migrations/` to `migrations_archive/` specifically
so no tool (or person) treats it as a runnable migration directory.
