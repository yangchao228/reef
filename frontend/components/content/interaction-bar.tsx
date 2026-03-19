"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { toggleLike, trackView } from "@/lib/api";

interface InteractionBarProps {
  slug: string;
  initialLikes: number;
  initialViews: number;
}

export function InteractionBar({
  slug,
  initialLikes,
  initialViews,
}: InteractionBarProps) {
  const [views, setViews] = useState(initialViews);
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const hasTracked = useRef(false);

  useEffect(() => {
    if (hasTracked.current) {
      return;
    }

    hasTracked.current = true;
    void trackView(slug).then((data) => setViews(data.views));
  }, [slug]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg-card p-4 text-sm text-t2">
      <span>{views} 次阅读</span>
      <span className="text-t4">•</span>
      <button
        className="rounded-full border border-border px-3 py-1.5 transition hover:border-pri hover:text-t1 disabled:opacity-50"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const data = await toggleLike(slug);
            setLikes(data.likes);
            setLiked(data.liked);
          });
        }}
        type="button"
      >
        {liked ? "已点赞" : "点赞"} · {likes}
      </button>
      <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1.5 text-[var(--tag-c)]">
        首版为原型交互，当前数据存于进程内
      </span>
    </div>
  );
}
