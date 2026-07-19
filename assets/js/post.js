// Post detail page: post body, threaded comments, votes, replies.
import {
  supabase,
  configured,
  isOwner,
  initShell,
  openAuthDialog,
  el,
  timeAgo,
  fullDate,
  showSetupNotice,
  showError,
} from "./common.js";

const content = document.getElementById("content");
const postId = Number(new URLSearchParams(location.search).get("id"));

let currentSession = null;
let post = null;
let comments = [];
let scores = new Map(); // comment id -> total score
let myVotes = new Map(); // comment id -> my vote (+1 / -1)
let openReplyId = null; // comment id whose reply form is open
let shellReady = false;

init();

async function init() {
  await initShell((session) => {
    currentSession = session;
    if (shellReady && configured && Number.isFinite(postId)) refresh();
  });
  shellReady = true;

  if (!configured) {
    showSetupNotice(content);
    return;
  }
  if (!Number.isFinite(postId)) {
    showError(content, "No post specified.");
    return;
  }
  await refresh();
}

async function refresh() {
  const [postRes, commentsRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, body, created_at, profiles!posts_author_id_fkey ( display_name )")
      .eq("id", postId)
      .maybeSingle(),
    supabase
      .from("comments")
      .select("id, post_id, parent_id, author_id, body, created_at, profiles!comments_author_id_fkey ( display_name )")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  ]);

  if (postRes.error) return showError(content, postRes.error.message);
  if (!postRes.data) return showError(content, "This post doesn't exist (it may have been removed).");
  if (commentsRes.error) return showError(content, commentsRes.error.message);

  post = postRes.data;
  comments = commentsRes.data;
  await loadVotes();
  render();
}

async function loadVotes() {
  scores = new Map();
  myVotes = new Map();
  if (!comments.length) return;

  const { data, error } = await supabase
    .from("comment_votes")
    .select("comment_id, voter_id, value")
    .in("comment_id", comments.map((c) => c.id));
  if (error) return;

  for (const vote of data) {
    scores.set(vote.comment_id, (scores.get(vote.comment_id) ?? 0) + vote.value);
    if (currentSession && vote.voter_id === currentSession.user.id) {
      myVotes.set(vote.comment_id, vote.value);
    }
  }
}

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------
function render() {
  document.title = `${post.title} — ${window.MICROFORUM_CONFIG.FORUM_TITLE}`;

  const postCard = el("article", { class: "card post-full" },
    el("h1", { text: post.title }),
    el("div", { class: "meta" },
      el("span", { class: "author", text: post.profiles?.display_name ?? "Owner" }),
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("span", { text: timeAgo(post.created_at), title: fullDate(post.created_at) })),
    el("div", { class: "post-body", text: post.body }),
    isOwner(currentSession)
      ? el("div", { class: "composer-actions", style: "margin-top:20px" },
          el("button", {
            class: "btn btn-danger-ghost btn-sm",
            text: "Delete post",
            onclick: deletePost,
          }))
      : null
  );

  const count = comments.length;
  const section = el("section", { class: "comments-section" },
    el("h2", { text: `${count} comment${count === 1 ? "" : "s"}` }));

  if (count) {
    section.append(renderTree(null));
  } else {
    section.append(
      el("p", { class: "empty-state", text: "No comments yet — be the first to share feedback." })
    );
  }

  section.append(renderCommentBox());
  content.replaceChildren(postCard, section);
}

function renderTree(parentId) {
  const children = comments.filter((c) => c.parent_id === parentId);
  const list = el("ul", {
    class: parentId === null ? "comment-thread" : "comment-children",
  });
  for (const comment of children) {
    const item = el("li", {}, renderComment(comment));
    const sub = comments.some((c) => c.parent_id === comment.id)
      ? renderTree(comment.id)
      : null;
    if (sub) item.append(sub);
    list.append(item);
  }
  return list;
}

function arrowSvg(direction) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    direction === "up" ? "M8 3l6 8H2l6-8z" : "M8 13L2 5h12l-6 8z"
  );
  svg.append(path);
  return svg;
}

function renderComment(comment) {
  const score = scores.get(comment.id) ?? 0;
  const mine = myVotes.get(comment.id) ?? 0;

  const scoreEl = el("span", {
    class: `vote-score${score > 0 ? " positive" : score < 0 ? " negative" : ""}`,
    text: String(score),
    "aria-label": `Score: ${score}`,
  });

  const upBtn = el("button", {
    class: `vote-btn${mine === 1 ? " active-up" : ""}`,
    "aria-label": "Upvote",
    "aria-pressed": String(mine === 1),
    title: "Upvote",
    onclick: () => castVote(comment.id, 1),
  }, arrowSvg("up"));

  const downBtn = el("button", {
    class: `vote-btn${mine === -1 ? " active-down" : ""}`,
    "aria-label": "Downvote",
    "aria-pressed": String(mine === -1),
    title: "Downvote",
    onclick: () => castVote(comment.id, -1),
  }, arrowSvg("down"));

  const actions = el("div", { class: "comment-actions" },
    el("button", {
      class: "btn btn-ghost btn-sm",
      text: openReplyId === comment.id ? "Cancel reply" : "Reply",
      onclick: () => toggleReply(comment.id),
    }));

  const canDelete =
    currentSession &&
    (currentSession.user.id === comment.author_id || isOwner(currentSession));
  if (canDelete) {
    actions.append(
      el("button", {
        class: "btn btn-danger-ghost btn-sm",
        text: "Delete",
        onclick: () => deleteComment(comment.id),
      })
    );
  }

  const main = el("div", { class: "comment-main" },
    el("div", { class: "meta" },
      el("span", { class: "author", text: comment.profiles?.display_name ?? "User" }),
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("span", { text: timeAgo(comment.created_at), title: fullDate(comment.created_at) })),
    el("div", { class: "comment-body", text: comment.body }),
    actions
  );

  if (openReplyId === comment.id) {
    main.append(renderReplyForm(comment.id));
  }

  return el("div", { class: "comment", id: `comment-${comment.id}` },
    el("div", { class: "vote-col" }, upBtn, scoreEl, downBtn),
    main
  );
}

function renderReplyForm(parentId) {
  const form = el("form", { class: "reply-form" });
  const textarea = el("textarea", {
    name: "body",
    maxlength: "5000",
    required: "",
    placeholder: "Write a reply…",
  });
  const message = el("p", { class: "form-message" });
  form.append(
    textarea,
    message,
    el("div", { class: "composer-actions" },
      el("button", { class: "btn btn-primary btn-sm", type: "submit", text: "Post reply" }))
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitComment(textarea.value, parentId, form, message);
  });
  queueMicrotask(() => textarea.focus());
  return form;
}

function renderCommentBox() {
  if (!currentSession) {
    return el("div", { class: "card comment-box" },
      el("h3", { text: "Join the discussion" }),
      el("p", { class: "form-message", text: "Sign in or create a free account to comment, reply, and vote." }),
      el("button", { class: "btn btn-primary", text: "Sign in to comment", onclick: openAuthDialog })
    );
  }

  const form = el("form", { class: "comment-box card" });
  const textarea = el("textarea", {
    name: "body",
    maxlength: "5000",
    required: "",
    placeholder: "Share feedback, report a bug, or ask a question…",
  });
  const message = el("p", { class: "form-message" });
  form.append(
    el("h3", { text: "Add a comment" }),
    textarea,
    message,
    el("div", { class: "composer-actions", style: "margin-top:10px" },
      el("button", { class: "btn btn-primary", type: "submit", text: "Post comment" }))
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitComment(textarea.value, null, form, message);
  });
  return form;
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
function toggleReply(commentId) {
  if (!currentSession) return openAuthDialog();
  openReplyId = openReplyId === commentId ? null : commentId;
  render();
}

async function submitComment(body, parentId, form, message) {
  body = body.trim();
  if (!body || !currentSession) return;

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  message.textContent = "";
  message.className = "form-message";

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    parent_id: parentId,
    author_id: currentSession.user.id,
    body,
  });

  submitBtn.disabled = false;
  if (error) {
    message.textContent = error.message;
    message.className = "form-message error";
    return;
  }
  openReplyId = null;
  await refresh();
}

async function castVote(commentId, value) {
  if (!currentSession) return openAuthDialog();

  const existing = myVotes.get(commentId);
  let error;
  if (existing === value) {
    // Clicking the same arrow again removes the vote.
    ({ error } = await supabase
      .from("comment_votes")
      .delete()
      .eq("comment_id", commentId)
      .eq("voter_id", currentSession.user.id));
  } else {
    ({ error } = await supabase.from("comment_votes").upsert(
      { comment_id: commentId, voter_id: currentSession.user.id, value },
      { onConflict: "comment_id,voter_id" }
    ));
  }
  if (error) return;

  await loadVotes();
  render();
}

async function deleteComment(commentId) {
  const hasReplies = comments.some((c) => c.parent_id === commentId);
  const warning = hasReplies
    ? "Delete this comment and all of its replies?"
    : "Delete this comment?";
  if (!confirm(warning)) return;

  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (!error) await refresh();
}

async function deletePost() {
  if (!confirm("Delete this post and its entire discussion? This can't be undone.")) return;
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (!error) location.href = "./";
}
