// MicroForum configuration.
//
// After creating your Supabase project (see README.md), replace the two
// placeholder values below with your project's URL and anon/public key
// (Supabase Dashboard → Project Settings → API). The anon key is safe to
// publish: every table is protected by Row Level Security, so the key only
// grants what the policies in supabase/schema.sql allow.
window.MICROFORUM_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL", // e.g. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",

  // Only this account can create posts. Must match the email in the
  // is_owner() function inside supabase/schema.sql — the database enforces
  // the rule; this value only controls what the UI shows.
  OWNER_EMAIL: "joshuagwood2210@gmail.com",

  FORUM_TITLE: "MicroForum",
  FORUM_TAGLINE: "Updates & feedback for my microbiology apps",
};
