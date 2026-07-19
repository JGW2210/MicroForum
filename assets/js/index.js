// Home page: post feed + owner-only composer.
import {
  supabase,
  configured,
  isOwner,
  initShell,
  el,
  timeAgo,
  showSetupNotice,
  showError,
} from "./common.js";

const content = document.getElementById("content");
const composerWrap = document.getElementById("owner-composer");
const postForm = document.getElementById("new-post-form");
const postFormMessage = document.getElementById("post-form-message");

let currentSession = null;

init();

async function init() {
  await initShell((session) => {
    currentSession = session;
    composerWrap.hidden = !isOwner(session);
  });

  if (!configured) {
    showSetupNotice(content);
    return;
  }
  await loadPosts();
}

async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, body, created_at, profiles!posts_author_id_fkey ( display_name ), comments ( count )")
    .order("created_at", { ascending: false });

  if (error) {
    showError(content, error.message);
    return;
  }

  if (!data.length) {
    content.replaceChildren(
      el("div", { class: "empty-state" },
        el("p", { text: "No posts yet — updates will appear here soon." }))
    );
    return;
  }

  const list = el("ul", { class: "post-list" });
  for (const post of data) {
    const commentCount = post.comments?.[0]?.count ?? 0;
    list.append(
      el("li", { class: "card post-card" },
        el("h2", {},
          el("a", { href: `post.html?id=${post.id}`, text: post.title })),
        el("p", { class: "snippet", text: post.body }),
        el("div", { class: "meta" },
          el("span", { class: "author", text: post.profiles?.display_name ?? "Owner" }),
          el("span", { class: "dot", "aria-hidden": "true" }),
          el("span", { text: timeAgo(post.created_at) }),
          el("span", { class: "dot", "aria-hidden": "true" }),
          el("span", { text: `${commentCount} comment${commentCount === 1 ? "" : "s"}` }))
      )
    );
  }
  content.replaceChildren(list);
}

postForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentSession) return;

  const title = postForm.elements.title.value.trim();
  const body = postForm.elements.body.value.trim();
  if (!title || !body) return;

  const submitBtn = postForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  postFormMessage.textContent = "";
  postFormMessage.className = "form-message";

  const { error } = await supabase.from("posts").insert({
    title,
    body,
    author_id: currentSession.user.id,
  });

  submitBtn.disabled = false;
  if (error) {
    postFormMessage.textContent = error.message;
    postFormMessage.className = "form-message error";
    return;
  }
  postForm.reset();
  await loadPosts();
});
