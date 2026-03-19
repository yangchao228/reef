import Link from "next/link";

import { listLatestItems } from "@/lib/content-repository";
import { getModuleBySlug } from "@/lib/modules";

export async function UpdateTimeline() {
  const items = await listLatestItems(6);

  return (
    <section className="px-5 pb-14 sm:px-8">
      <div className="mx-auto max-w-6xl rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-t4">
              Recent Updates
            </p>
            <h2 className="mt-2 text-2xl text-t1">最新更新时间线</h2>
          </div>
          <Link className="text-sm text-pri transition hover:text-pri-d" href="/search">
            查看全部 →
          </Link>
        </div>

        <div className="relative pl-8 before:absolute before:left-3.5 before:top-1 before:h-[calc(100%-0.5rem)] before:w-px before:bg-border">
          {items.map((item) => {
            const module = getModuleBySlug(item.module);
            return (
              <Link
                className="group relative mb-4 block rounded-2xl border border-border bg-bg px-5 py-4 transition hover:border-pri/60"
                href={`/${item.module}/${item.slug}`}
                key={item.id}
              >
                <span
                  className="absolute -left-[1.85rem] top-5 h-3 w-3 rounded-full border-2 border-bg-card"
                  style={{ backgroundColor: module?.accent }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--tag-c)]">
                    {module?.shortLabel}
                  </span>
                  <span className="text-xs text-t3">
                    {new Intl.DateTimeFormat("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date(item.publishedAt))}
                  </span>
                </div>
                <h3 className="mt-3 text-base text-t1 transition group-hover:text-pri-d">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-7 text-t2">{item.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span
                      className="rounded-full border border-border px-2 py-1 text-xs text-t3"
                      key={tag}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
