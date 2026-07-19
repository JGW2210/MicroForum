// Shared shell: Supabase client, auth dialog, header session UI, helpers.
// supabase-js v2.110.7, bundled locally (see assets/vendor/) so the site has
// no runtime CDN dependency.
import { createClient } from "../vendor/supabase-js.js";

const cfg = window.MICROFORUM_CONFIG;

export const OWNER_EMAIL = (cfg.OWNER_EMAIL || "").toLowerCase();

export const configured =
  /^https:\/\//.test(cfg.SUPABASE_URL) && !/^YOUR_/.test(cfg.SUPABASE_ANON_KEY);

export const supabase = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

export function isOwner(session) {
  return !!session && (session.user.email || "").toLowerCase() === OWNER_EMAIL;
}

// Tiny DOM builder so all user content goes through textContent (XSS-safe).
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

export function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${name}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function fullDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function showSetupNotice(container) {
  container.replaceChildren(
    el(
      "div",
      { class: "notice" },
      el("h2", { text: "Almost there — connect Supabase" }),
      el(
        "p",
        {},
        "This site isn't linked to a Supabase project yet. Create a free project, run ",
        el("code", { text: "supabase/schema.sql" }),
        " in its SQL editor, then paste your project URL and anon key into ",
        el("code", { text: "assets/js/config.js" }),
        ". Full steps are in the README."
      )
    )
  );
}

export function showError(container, message) {
  container.replaceChildren(
    el(
      "div",
      { class: "notice error" },
      el("h2", { text: "Something went wrong" }),
      el("p", { text: message })
    )
  );
}

// ------------------------------------------------------------------
// Header + auth dialog. Both pages include the same markup; this
// wires it up and invokes onSession(session) on every auth change.
// ------------------------------------------------------------------
export async function initShell(onSession) {
  document.title = cfg.FORUM_TITLE;
  const brandName = document.querySelector("[data-brand-name]");
  if (brandName) brandName.textContent = cfg.FORUM_TITLE;
  const tagline = document.querySelector("[data-tagline]");
  if (tagline) tagline.textContent = cfg.FORUM_TAGLINE;

  const dialog = document.getElementById("auth-dialog");
  const signInBtn = document.getElementById("sign-in-btn");
  const signOutBtn = document.getElementById("sign-out-btn");
  const userChip = document.getElementById("user-chip");
  const userName = userChip?.querySelector(".user-name");
  const ownerBadge = userChip?.querySelector(".owner-badge");

  signInBtn?.addEventListener("click", () => openAuthDialog());
  document
    .getElementById("auth-close-btn")
    ?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const tabs = [...document.querySelectorAll(".auth-tab")];
  const nameField = document.getElementById("auth-name-field");
  const form = document.getElementById("auth-form");
  const message = document.getElementById("auth-message");
  const submitBtn = document.getElementById("auth-submit-btn");
  let mode = "signin";

  function setMode(next) {
    mode = next;
    for (const tab of tabs) {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    }
    nameField.hidden = mode !== "signup";
    submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
    message.textContent = "";
    message.className = "form-message";
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  }
  setMode("signin");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase) return;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const displayName = form.elements.display_name.value.trim();

    message.textContent = "";
    message.className = "form-message";
    submitBtn.disabled = true;
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: location.href,
          },
        });
        if (error) throw error;
        if (!data.session) {
          message.textContent =
            "Account created — check your inbox for a confirmation link, then sign in.";
          message.className = "form-message success";
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      dialog.close();
      form.reset();
    } catch (error) {
      message.textContent = error.message || "Authentication failed.";
      message.className = "form-message error";
    } finally {
      submitBtn.disabled = false;
    }
  });

  signOutBtn?.addEventListener("click", async () => {
    await supabase?.auth.signOut();
  });

  function renderSession(session) {
    if (session) {
      signInBtn.hidden = true;
      userChip.classList.add("visible");
      const metaName = session.user.user_metadata?.display_name;
      userName.textContent =
        metaName || session.user.email?.split("@")[0] || "Account";
      ownerBadge.hidden = !isOwner(session);
    } else {
      signInBtn.hidden = false;
      userChip.classList.remove("visible");
    }
  }

  if (!supabase) {
    renderSession(null);
    onSession(null);
    return;
  }

  const { data } = await supabase.auth.getSession();
  renderSession(data.session);
  onSession(data.session);

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      renderSession(session);
      onSession(session);
    }
  });
}

export function openAuthDialog() {
  document.getElementById("auth-dialog")?.showModal();
}
