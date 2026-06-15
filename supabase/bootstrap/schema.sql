-- =============================================================================
-- bootstrap/schema.sql  —  CANONICAL FULL SCHEMA for a NEW teacher project
-- =============================================================================
-- Run this ONCE against a fresh Supabase project (SQL Editor), BEFORE seed.sql.
--
-- DO NOT run the supabase/migrations_archive/ chain (0002–0011) on a new
-- project — this file already reflects their fully-applied end state plus the
-- base schema that was originally created in the prod dashboard.
--
-- Source: pg_dump --schema-only --schema=public --no-owner --no-privileges of
-- prod (ref eesyjkmmyiisuaghhota), captured 2026-06, plus three things a
-- --schema public dump cannot see, captured separately:
--   1. storage.objects RLS policies         (Section B below)
--   2. the on_auth_user_created trigger on   (Section C below)
--      auth.users  (the function itself is
--      in Section A; the trigger is not)
--
-- Header noise removed vs. raw dump: \restrict/\unrestrict psql directives,
-- CREATE SCHEMA public / its COMMENT (the schema already exists in a fresh
-- project). No supabase_* roles / GRANTs were present (--no-owner
-- --no-privileges did their job).
-- =============================================================================


-- =============================================================================
-- SECTION A — public schema (tables, functions, RLS, indexes, FKs)
-- =============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


--
-- Name: delete_my_account(); Type: FUNCTION; Schema: public
--

CREATE FUNCTION public.delete_my_account() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  v_avatar_url text;
  v_avatar_paths text[] := '{}';
  v_post_image_paths text[];
begin
  -- Identify the caller from the JWT.
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- Block admin self-delete.
  select is_admin, avatar_url
    into v_is_admin, v_avatar_url
  from public.profiles
  where id = v_user_id;

  if coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error', 'is_admin');
  end if;

  -- Collect storage paths to return for post-commit cleanup by the caller.
  if v_avatar_url is not null then
    v_avatar_paths := array[v_user_id::text || '/avatar.jpg'];
  end if;

  select coalesce(array_agg(pi.storage_path), '{}')
    into v_post_image_paths
  from public.post_images pi
  join public.posts p on p.id = pi.post_id
  where p.author_id = v_user_id;

  -- (1) Tombstone the profile (row KEPT so posts/comments show "[Deleted user]").
  update public.profiles
     set display_name = '[Deleted user]',
         avatar_url   = null,
         bio          = null,
         deleted_at   = now(),
         is_admin     = false
   where id = v_user_id;

  -- (2) Remove post_images rows for this user's posts (files removed by caller).
  delete from public.post_images
   where post_id in (select id from public.posts where author_id = v_user_id);

  -- (3) Progress tables.
  delete from public.content_progress where user_id = v_user_id;
  delete from public.classroom_recording_progress where user_id = v_user_id;

  -- (4) Defensive: detach admin-authored classroom rows (ex-admin edge case;
  --     created_by -> auth.users has NO cascade and would block the delete).
  update public.classroom_folders   set created_by = null where created_by = v_user_id;
  update public.classroom_recordings set created_by = null where created_by = v_user_id;

  -- (5) Delete the auth user (revokes sessions, frees the email). The profile
  --     row survives because the profiles -> auth.users FK was dropped above;
  --     auth.sessions / auth.identities / auth.refresh_tokens cascade in GoTrue.
  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'storage_paths', jsonb_build_object(
      'avatars', to_jsonb(v_avatar_paths),
      'post-images', to_jsonb(v_post_image_paths)
    )
  );
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;


SET default_tablespace = '';
SET default_table_access_method = heap;

--
-- Tables
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    post_permission text DEFAULT 'all'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT channels_post_permission_check CHECK ((post_permission = ANY (ARRAY['all'::text, 'admin_only'::text])))
);

CREATE TABLE public.classroom_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    parent_folder_id uuid,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

CREATE TABLE public.classroom_recording_progress (
    user_id uuid NOT NULL,
    recording_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.classroom_recordings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    folder_id uuid,
    title text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    video_provider text,
    video_id text,
    video_status text DEFAULT 'pending'::text,
    video_duration_seconds integer,
    video_thumbnail_url text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

CREATE TABLE public.comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    description text,
    video_url text,
    document_url text,
    document_storage_path text,
    thumbnail_url text,
    thumbnail_storage_path text,
    "position" smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT content_items_check CHECK ((((type = 'video'::text) AND (video_url IS NOT NULL)) OR ((type = 'document'::text) AND (document_url IS NOT NULL)))),
    CONSTRAINT content_items_type_check CHECK ((type = ANY (ARRAY['video'::text, 'document'::text])))
);

CREATE TABLE public.content_progress (
    user_id uuid NOT NULL,
    content_item_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    location text,
    meeting_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    series_id uuid
);

CREATE TABLE public.post_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    url text NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    url text NOT NULL,
    storage_path text NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    video_provider text,
    video_id text,
    video_status text DEFAULT 'pending'::text,
    video_duration_seconds integer,
    video_thumbnail_url text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    title text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    channel_id uuid,
    edited_at timestamp with time zone
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text NOT NULL,
    bio text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    is_admin boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    cover_image_url text,
    cover_storage_path text,
    "position" smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_locked boolean DEFAULT false NOT NULL
);


--
-- Primary keys / unique constraints
--

ALTER TABLE ONLY public.channels ADD CONSTRAINT channels_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.channels ADD CONSTRAINT channels_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.classroom_folders ADD CONSTRAINT classroom_folders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.classroom_recording_progress ADD CONSTRAINT classroom_recording_progress_pkey PRIMARY KEY (user_id, recording_id);
ALTER TABLE ONLY public.classroom_recordings ADD CONSTRAINT classroom_recordings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.comment_likes ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);
ALTER TABLE ONLY public.comments ADD CONSTRAINT comments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.content_items ADD CONSTRAINT content_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.content_progress ADD CONSTRAINT content_progress_pkey PRIMARY KEY (user_id, content_item_id);
ALTER TABLE ONLY public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.post_attachments ADD CONSTRAINT post_attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.post_images ADD CONSTRAINT post_images_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.post_videos ADD CONSTRAINT post_videos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.post_videos ADD CONSTRAINT post_videos_post_id_key UNIQUE (post_id);
ALTER TABLE ONLY public.post_likes ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);
ALTER TABLE ONLY public.posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.topics ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Indexes
--

CREATE INDEX channels_position_idx ON public.channels USING btree ("position");
CREATE INDEX classroom_folders_parent_folder_id_idx ON public.classroom_folders USING btree (parent_folder_id);
CREATE INDEX classroom_recording_progress_recording_id_idx ON public.classroom_recording_progress USING btree (recording_id);
CREATE INDEX classroom_recording_progress_user_id_idx ON public.classroom_recording_progress USING btree (user_id);
CREATE INDEX classroom_recordings_folder_id_idx ON public.classroom_recordings USING btree (folder_id);
CREATE INDEX classroom_recordings_video_id_idx ON public.classroom_recordings USING btree (video_id);
CREATE INDEX comment_likes_comment_id_idx ON public.comment_likes USING btree (comment_id);
CREATE INDEX comment_likes_user_id_idx ON public.comment_likes USING btree (user_id);
CREATE INDEX comments_post_id_idx ON public.comments USING btree (post_id);
CREATE INDEX content_items_topic_id_idx ON public.content_items USING btree (topic_id);
CREATE INDEX content_progress_user_id_idx ON public.content_progress USING btree (user_id);
CREATE INDEX events_series_id_idx ON public.events USING btree (series_id);
CREATE INDEX events_starts_at_idx ON public.events USING btree (starts_at);
CREATE INDEX post_attachments_post_id_idx ON public.post_attachments USING btree (post_id);
CREATE INDEX post_images_post_id_idx ON public.post_images USING btree (post_id);
CREATE INDEX post_videos_post_id_idx ON public.post_videos USING btree (post_id);
CREATE INDEX post_videos_video_id_idx ON public.post_videos USING btree (video_id);
CREATE INDEX post_likes_post_id_idx ON public.post_likes USING btree (post_id);
CREATE INDEX post_likes_user_id_idx ON public.post_likes USING btree (user_id);
CREATE INDEX posts_channel_id_idx ON public.posts USING btree (channel_id);
CREATE INDEX posts_created_at_idx ON public.posts USING btree (created_at DESC);
CREATE INDEX profiles_deleted_at_idx ON public.profiles USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX topics_position_idx ON public.topics USING btree ("position");


--
-- Foreign keys
--
-- NOTE: profiles has NO FK to auth.users (intentionally dropped in 0007 so the
-- tombstone row survives auth-user deletion). Verified against prod: the
-- pg_constraint check for profiles foreign keys returned zero rows.
--

ALTER TABLE ONLY public.classroom_folders ADD CONSTRAINT classroom_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.classroom_folders ADD CONSTRAINT classroom_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.classroom_folders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.classroom_recording_progress ADD CONSTRAINT classroom_recording_progress_recording_id_fkey FOREIGN KEY (recording_id) REFERENCES public.classroom_recordings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.classroom_recording_progress ADD CONSTRAINT classroom_recording_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.classroom_recordings ADD CONSTRAINT classroom_recordings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.classroom_recordings ADD CONSTRAINT classroom_recordings_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.classroom_folders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comment_likes ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comment_likes ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comments ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comments ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.content_items ADD CONSTRAINT content_items_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.content_progress ADD CONSTRAINT content_progress_content_item_id_fkey FOREIGN KEY (content_item_id) REFERENCES public.content_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.content_progress ADD CONSTRAINT content_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.events ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.post_attachments ADD CONSTRAINT post_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_images ADD CONSTRAINT post_images_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_videos ADD CONSTRAINT post_videos_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_likes ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_likes ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.posts ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.posts ADD CONSTRAINT posts_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id);


--
-- Enable Row Level Security
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_recording_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;


--
-- RLS policies (public schema)
--

CREATE POLICY "Comments are viewable by authenticated users" ON public.comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their own comments" ON public.comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = author_id));
CREATE POLICY "Users can update their own comments" ON public.comments FOR UPDATE TO authenticated USING ((auth.uid() = author_id));
CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE TO authenticated USING ((auth.uid() = author_id));

CREATE POLICY "Content items are viewable by authenticated users" ON public.content_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins can insert content items" ON public.content_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "Only admins can update content items" ON public.content_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "Only admins can delete content items" ON public.content_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

CREATE POLICY "Topics are viewable by authenticated users" ON public.topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins can insert topics" ON public.topics FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "Only admins can update topics" ON public.topics FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "Only admins can delete topics" ON public.topics FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

CREATE POLICY "Post images are viewable by authenticated users" ON public.post_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can attach images to their own posts" ON public.post_images FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.posts WHERE ((posts.id = post_images.post_id) AND (posts.author_id = auth.uid())))));
CREATE POLICY "Users can delete images from their own posts" ON public.post_images FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.posts WHERE ((posts.id = post_images.post_id) AND (posts.author_id = auth.uid())))));

CREATE POLICY "Posts are viewable by authenticated users" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY posts_insert_channel_permitted ON public.posts FOR INSERT TO authenticated WITH CHECK (((auth.uid() = author_id) AND ((EXISTS ( SELECT 1 FROM public.channels c WHERE ((c.id = posts.channel_id) AND (c.post_permission = 'all'::text)))) OR (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))))));
CREATE POLICY posts_update_owner_or_admin ON public.posts FOR UPDATE TO authenticated USING (((auth.uid() = author_id) OR (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))))) WITH CHECK (((auth.uid() = author_id) OR (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))));
CREATE POLICY posts_delete_owner_or_admin ON public.posts FOR DELETE TO authenticated USING (((auth.uid() = author_id) OR (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))));

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));

CREATE POLICY "Users can view their own progress" ON public.content_progress FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own progress" ON public.content_progress FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own progress" ON public.content_progress FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own progress" ON public.content_progress FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY channels_select_authenticated ON public.channels FOR SELECT TO authenticated USING (true);
CREATE POLICY channels_insert_admin ON public.channels FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY channels_update_admin ON public.channels FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY channels_delete_admin ON public.channels FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

CREATE POLICY classroom_folders_select_authenticated ON public.classroom_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY classroom_folders_insert_admin ON public.classroom_folders FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY classroom_folders_update_admin ON public.classroom_folders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY classroom_folders_delete_admin ON public.classroom_folders FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

CREATE POLICY classroom_recordings_select_authenticated ON public.classroom_recordings FOR SELECT TO authenticated USING (true);
CREATE POLICY classroom_recordings_insert_admin ON public.classroom_recordings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY classroom_recordings_update_admin ON public.classroom_recordings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY classroom_recordings_delete_admin ON public.classroom_recordings FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));

CREATE POLICY classroom_recording_progress_select_own ON public.classroom_recording_progress FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY classroom_recording_progress_insert_own ON public.classroom_recording_progress FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY classroom_recording_progress_delete_own ON public.classroom_recording_progress FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY comment_likes_select ON public.comment_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY comment_likes_insert_own ON public.comment_likes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY comment_likes_delete_own ON public.comment_likes FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY post_likes_select ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY post_likes_insert_own ON public.post_likes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY post_likes_delete_own ON public.post_likes FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY post_attachments_select ON public.post_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY post_attachments_insert_own ON public.post_attachments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = ( SELECT posts.author_id FROM public.posts WHERE (posts.id = post_attachments.post_id))));
CREATE POLICY post_attachments_delete_own ON public.post_attachments FOR DELETE TO authenticated USING ((auth.uid() = ( SELECT posts.author_id FROM public.posts WHERE (posts.id = post_attachments.post_id))));

CREATE POLICY post_videos_select ON public.post_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY post_videos_insert_admin_own ON public.post_videos FOR INSERT TO authenticated WITH CHECK (((auth.uid() = ( SELECT posts.author_id FROM public.posts WHERE (posts.id = post_videos.post_id))) AND (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))));
CREATE POLICY post_videos_update_admin_own ON public.post_videos FOR UPDATE TO authenticated USING (((auth.uid() = ( SELECT posts.author_id FROM public.posts WHERE (posts.id = post_videos.post_id))) AND (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))))) WITH CHECK (((auth.uid() = ( SELECT posts.author_id FROM public.posts WHERE (posts.id = post_videos.post_id))) AND (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))));
CREATE POLICY post_videos_delete_admin_own ON public.post_videos FOR DELETE TO authenticated USING (((auth.uid() = ( SELECT posts.author_id FROM public.posts WHERE (posts.id = post_videos.post_id))) AND (EXISTS ( SELECT 1 FROM public.profiles p WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))));
-- A fresh Supabase project can ship without the default table privileges PostgREST
-- relies on, so grant them explicitly for post_videos (added in migration 0012).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_videos TO anon, authenticated, service_role;

CREATE POLICY events_select_authenticated ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY events_insert_admin ON public.events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY events_update_admin ON public.events FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY events_delete_admin ON public.events FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


-- =============================================================================
-- SECTION B — storage.objects RLS policies
-- =============================================================================
-- Captured separately from pg_policy on storage.objects (a --schema public
-- dump does not include the storage schema). The storage.objects table and its
-- RLS-enabled state already exist in every fresh Supabase project; we only add
-- the app's policies. The buckets themselves are created in seed.sql.
-- =============================================================================

CREATE POLICY "Avatars are viewable by authenticated users" ON storage.objects AS permissive FOR SELECT TO authenticated USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Users can upload their own avatar" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can update their own avatar" ON storage.objects AS permissive FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can delete their own avatar" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Post images are viewable by authenticated users" ON storage.objects AS permissive FOR SELECT TO authenticated USING ((bucket_id = 'post-images'::text));
CREATE POLICY "Users can upload their own post images" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'post-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can delete their own post images" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'post-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Topic covers are viewable by authenticated users" ON storage.objects AS permissive FOR SELECT TO authenticated USING ((bucket_id = 'topic-covers'::text));
CREATE POLICY "Only admins can upload topic covers" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'topic-covers'::text) AND (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));
CREATE POLICY "Only admins can update topic covers" ON storage.objects AS permissive FOR UPDATE TO authenticated USING (((bucket_id = 'topic-covers'::text) AND (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));
CREATE POLICY "Only admins can delete topic covers" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'topic-covers'::text) AND (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

CREATE POLICY "Content files are viewable by authenticated users" ON storage.objects AS permissive FOR SELECT TO authenticated USING ((bucket_id = 'content-files'::text));
CREATE POLICY "Only admins can upload content files" ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'content-files'::text) AND (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));
CREATE POLICY "Only admins can update content files" ON storage.objects AS permissive FOR UPDATE TO authenticated USING (((bucket_id = 'content-files'::text) AND (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));
CREATE POLICY "Only admins can delete content files" ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'content-files'::text) AND (EXISTS ( SELECT 1 FROM public.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

CREATE POLICY post_attachments_objects_insert_own ON storage.objects AS permissive FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'post-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY post_attachments_objects_delete_own ON storage.objects AS permissive FOR DELETE TO authenticated USING (((bucket_id = 'post-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


-- =============================================================================
-- SECTION C — auth.users trigger
-- =============================================================================
-- The function public.handle_new_user() is defined in Section A, but the
-- TRIGGER that fires it lives on auth.users and is NOT captured by a
-- --schema public dump. Without this, signups create no profiles row and the
-- whole app is broken for new users.
--
-- Prod definition was: EXECUTE FUNCTION handle_new_user()  (unqualified).
-- Qualified to public.handle_new_user() here so it resolves regardless of the
-- session search_path on a fresh project.
-- =============================================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- End of bootstrap/schema.sql. Run seed.sql next.
-- =============================================================================
