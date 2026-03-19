import Link from "next/link";

import { Hero } from "@/components/home/hero";
import { ModuleGrid } from "@/components/home/module-grid";
import { UpdateTimeline } from "@/components/home/update-timeline";
import { listAllTags, listCategories } from "@/lib/content-repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const categories = (await listCategories()).slice(0, 4);
  const tags = (await listAllTags()).slice(0, 8);

  return (
    <>
      <Hero />
      <ModuleGrid />
      <UpdateTimeline />
      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Categories</p>
            <h2 className="mt-2 text-2xl text-t1">分类总览</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {categories.map((category) => (
                <Link
                  className="rounded-2xl border border-border bg-bg p-4 transition hover:border-pri/60"
                  href={`/categories/${category.slug}`}
                  key={category.slug}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg text-t1">{category.name}</h3>
                    <span className="text-xs text-t3">{category.count} 条</span>
                  </div>
                  <p className="mt-3 text-sm text-t2">
                    覆盖模块：{category.modules.join(" · ")}
                  </p>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Tags</p>
            <h2 className="mt-2 text-2xl text-t1">高频标签</h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Link
                  className="rounded-full border border-border px-3 py-2 text-sm text-t2 transition hover:border-pri hover:text-t1"
                  href={`/tags/${tag}`}
                  key={tag}
                >
                  #{tag}
                </Link>
              ))}
            </div>
            <p className="mt-6 text-sm leading-7 text-t3">
              首版先把内容结构和浏览体验固定下来，后面再接真实同步链路和持久化。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
