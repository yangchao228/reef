"use client";

import { useState, useTransition } from "react";

import { submitComment } from "@/lib/api";
import { CommentRecord } from "@/lib/types";

export function CommentsPanel({
  slug,
  comments,
}: {
  slug: string;
  comments: CommentRecord[];
}) {
  const [nickname, setNickname] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <section className="mt-10 rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Comments</p>
          <h2 className="mt-2 text-2xl text-t1">游客评论</h2>
        </div>
        <span className="text-xs text-t3">默认进入待审核状态</span>
      </div>

      <form
        className="mt-6 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");

          startTransition(async () => {
            const payload = await submitComment(slug, { nickname, body });
            if (payload.error) {
              setMessage(payload.error.message);
              return;
            }

            setNickname("");
            setBody("");
            setMessage("评论已提交，审核后展示。");
          });
        }}
      >
        <input
          className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
          onChange={(event) => setNickname(event.target.value)}
          placeholder="你的昵称"
          required
          value={nickname}
        />
        <textarea
          className="min-h-28 rounded-2xl border border-border bg-bg px-4 py-3 text-sm leading-7 text-t1 outline-none placeholder:text-t4 focus:border-pri"
          onChange={(event) => setBody(event.target.value)}
          placeholder="留下你的判断、补充或反对意见。"
          required
          value={body}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-t3">{message}</p>
          <button
            className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60 dark:text-[#0D0D0D]"
            disabled={isPending}
            type="submit"
          >
            提交评论
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-4">
        {comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
            还没有公开评论，首条留言会从这里开始。
          </div>
        ) : (
          comments.map((comment) => (
            <article className="rounded-2xl border border-border bg-bg p-5" key={comment.id}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm text-t1">{comment.nickname}</h3>
                <span className="text-xs text-t4">
                  {new Intl.DateTimeFormat("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(comment.createdAt))}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-t2">{comment.body}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
