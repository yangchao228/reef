import Link from "next/link";

import { getModuleBySlug } from "@/lib/modules";
import { ContentItem } from "@/lib/types";

export function ContentCard({ item }: { item: ContentItem }) {
  const module = getModuleBySlug(item.module);

  return (
    <Link
      className="group block rounded-2xl border border-border bg-bg-card p-5 transition hover:-translate-y-0.5 hover:border-pri/60"
      href={`/${item.module}/${item.slug}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
          style={{
            backgroundColor: `${module?.accent ?? "#1D9E75"}1A`,
            color: module?.accent ?? "#1D9E75",
          }}
        >
          {module?.shortLabel}
        </span>
        <span className="text-xs text-t3">
          {new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(item.publishedAt))}
        </span>
      </div>
      <h2 className="mt-4 text-xl text-t1 transition group-hover:text-pri-d">
        {item.title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-t2">{item.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-border px-2 py-1 text-xs text-t3">
          {item.categoryName ?? item.category}
        </span>
        {item.tags.slice(0, 3).map((tag) => (
          <span className="rounded-full border border-border px-2 py-1 text-xs text-t3" key={tag}>
            #{tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
