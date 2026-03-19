"use client";

export interface LikeResponse {
  likes: number;
  liked: boolean;
}

export interface ViewResponse {
  views: number;
}

export interface CommentPayload {
  nickname: string;
  body: string;
}

function ensureFingerprint() {
  const storageKey = "reef-fingerprint";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const value = crypto.randomUUID();
  window.localStorage.setItem(storageKey, value);
  return value;
}

export async function trackView(slug: string) {
  const response = await fetch(`/api/content/${slug}/view`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fingerprint: ensureFingerprint(),
    }),
  });

  const payload = (await response.json()) as { data: ViewResponse };
  return payload.data;
}

export async function toggleLike(slug: string) {
  const response = await fetch(`/api/content/${slug}/like`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fingerprint: ensureFingerprint(),
    }),
  });

  const payload = (await response.json()) as { data: LikeResponse };
  return payload.data;
}

export async function submitComment(slug: string, payload: CommentPayload) {
  const response = await fetch(`/api/content/${slug}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      fingerprint: ensureFingerprint(),
    }),
  });

  return response.json();
}
