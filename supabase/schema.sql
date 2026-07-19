-- ============================================================
-- MicroForum — Supabase schema + Row Level Security policies
--
-- Paste this whole file into the Supabase SQL Editor and run it
-- once against a fresh project (Dashboard → SQL Editor → New query).
--
-- Security model:
--   * Everyone (including signed-out visitors) can READ posts,
--     comments, votes, and display names.
--   * Only the forum owner (matched by the email below) can
--     create, edit, or delete posts.
--   * Any signed-in user can comment on posts and reply to
--     comments, and can edit/delete their own comments.
--   * The owner can also delete any comment (moderation).
--   * Any signed-in user gets exactly one vote (+1 or -1) per
--     comment, and can change or remove it.
-- ============================================================

-- ------------------------------------------------------------
-- Owner check. RLS policies call this, so the rule is enforced
-- by the database even if someone bypasses the web UI entirely.
-- ------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') = 'joshuagwood2210@gmail.com'
$$;

-- ------------------------------------------------------------
-- Profiles: one row per registered user, created automatically
-- on sign-up. Holds the public display name shown on comments.
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile when a user signs up. Runs as a
-- security-definer function so it can insert despite RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Posts: announcements / update threads. Owner-only writes.
-- ------------------------------------------------------------
create table public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

create policy "Posts are readable by everyone"
  on public.posts for select
  using (true);

create policy "Only the owner can create posts"
  on public.posts for insert
  to authenticated
  with check (public.is_owner() and author_id = auth.uid());

create policy "Only the owner can update posts"
  on public.posts for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "Only the owner can delete posts"
  on public.posts for delete
  to authenticated
  using (public.is_owner());

-- ------------------------------------------------------------
-- Comments: flat table with parent_id for threaded replies.
-- Any signed-in user can write; authors manage their own.
-- ------------------------------------------------------------
create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  parent_id bigint references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index comments_post_id_idx on public.comments (post_id);
create index comments_parent_id_idx on public.comments (parent_id);

alter table public.comments enable row level security;

create policy "Comments are readable by everyone"
  on public.comments for select
  using (true);

create policy "Signed-in users can comment as themselves"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Users can edit their own comments"
  on public.comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "Users can delete their own comments; owner can moderate"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id or public.is_owner());

-- ------------------------------------------------------------
-- Votes: one row per (comment, voter). value is +1 or -1.
-- The primary key makes double-voting impossible.
-- ------------------------------------------------------------
create table public.comment_votes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, voter_id)
);

alter table public.comment_votes enable row level security;

create policy "Votes are readable by everyone"
  on public.comment_votes for select
  using (true);

create policy "Users can cast their own votes"
  on public.comment_votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

create policy "Users can change their own votes"
  on public.comment_votes for update
  to authenticated
  using (auth.uid() = voter_id)
  with check (auth.uid() = voter_id);

create policy "Users can remove their own votes"
  on public.comment_votes for delete
  to authenticated
  using (auth.uid() = voter_id);
