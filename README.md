# 🦠 MicroForum

A lightweight forum for **updates and feedback on my microbiology apps**, built
as a static site (hosted free on GitHub Pages) backed by
[Supabase](https://supabase.com) (free tier) for authentication, storage, and
security.

## How it works

| Role | Can do |
| --- | --- |
| Visitors (signed out) | Read all posts, comments, and vote scores |
| Registered users | Comment on posts, reply to comments, upvote/downvote comments (one vote each), edit/delete their own comments |
| Owner (`joshuagwood2210@gmail.com`) | Everything above, plus create/edit/delete posts and moderate (delete) any comment |

These rules are enforced by **Postgres Row Level Security** in Supabase — not
just by the UI. Even someone calling the API directly with the public anon key
can only do what the policies in [`supabase/schema.sql`](supabase/schema.sql)
allow. That's why it's safe to publish the anon key in a static site.

There is no build step: plain HTML/CSS/JS with `supabase-js` bundled into
`assets/vendor/supabase-js.js`, so GitHub Pages can serve the repository as-is
with no external CDN dependency.

## Setup (one time, ~10 minutes)

### 1. Create the Supabase project

1. Sign up / sign in at [supabase.com](https://supabase.com) (free).
2. Create a **New project** (any name, e.g. `microforum`). Save the database
   password somewhere safe — you won't need it for the site, only for admin.
3. When the project finishes provisioning, open **SQL Editor → New query**,
   paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql),
   and click **Run**. This creates the tables, the sign-up trigger, and all
   Row Level Security policies.

### 2. Connect the site to your project

1. In the Supabase dashboard, go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public key**
2. Edit [`assets/js/config.js`](assets/js/config.js) and paste both values in
   place of the placeholders. Commit and push to `main`.

### 3. Enable GitHub Pages

1. In this repository on GitHub: **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or re-run the "Deploy to GitHub Pages" workflow from the
   Actions tab). Your site will be live at
   `https://<username>.github.io/MicroForum/`.

### 4. Point Supabase auth at your live site

1. In Supabase: **Authentication → URL Configuration**.
2. Set **Site URL** to your GitHub Pages URL
   (e.g. `https://jgw2210.github.io/MicroForum/`), so confirmation-email links
   send users back to the forum.

### 5. Create your owner account

1. Open the live site, click **Sign in → Create account**, and register with
   **`joshuagwood2210@gmail.com`** — the email hard-coded into the RLS
   policies. Confirm the email, sign in, and the "Post an update" composer
   appears.
2. Anyone else who registers gets a normal account: they can comment, reply,
   and vote, but the database rejects any post they try to create.

> **Optional:** Supabase requires email confirmation by default. To let users
> participate immediately, turn it off under
> **Authentication → Sign In / Up → Email → Confirm email**.

## Changing the owner email

The owner is identified by email in **two places** (keep them in sync):

1. `supabase/schema.sql` — the `is_owner()` function (re-run just that
   `create or replace function` statement in the SQL editor to update it).
2. `assets/js/config.js` — `OWNER_EMAIL` (controls which UI controls are
   shown; the database check above is what actually enforces it).

## Project structure

```
├── index.html              # Home: post feed + owner composer
├── post.html               # Post detail: threaded comments, votes, replies
├── assets/
│   ├── css/style.css       # Design system (auto dark mode, a11y focus states)
│   └── js/
│       ├── config.js       # ← your Supabase URL / anon key go here
│       ├── common.js       # Supabase client, auth dialog, shared helpers
│       ├── index.js        # Home page logic
│       └── post.js         # Post page logic
├── supabase/schema.sql     # Tables + Row Level Security (run once)
└── .github/workflows/deploy.yml  # GitHub Pages deployment
```

## Local development

Serve the folder with any static server (opening the files directly with
`file://` won't work because of ES modules):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
