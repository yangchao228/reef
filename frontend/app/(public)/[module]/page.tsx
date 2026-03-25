import { notFound, redirect } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { getModuleMeta, listModuleContent } from "@/lib/content-repository";
import {
  buildWorkspaceDirectoryHref,
  getRequestWorkspaceSlug,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ModulePage({
  params,
  searchParams,
}: {
  params: { module: string };
  searchParams: { category?: string; tag?: string };
}) {
  const workspaceSlug = getRequestWorkspaceSlug();
  const nextParams = new URLSearchParams();
  if (searchParams.category) {
    nextParams.set("category", searchParams.category);
  }
  if (searchParams.tag) {
    nextParams.set("tag", searchParams.tag);
  }
  const nextPath = nextParams.size
    ? `/${params.module}?${nextParams.toString()}`
    : `/${params.module}`;
  if (!workspaceSlug) {
    redirect(buildWorkspaceDirectoryHref(nextPath));
  }

  const module = await getModuleMeta(params.module, workspaceSlug);
  if (!module) {
    notFound();
  }

  const items = await listModuleContent(module.slug, {
    category: searchParams.category,
    tag: searchParams.tag,
  }, workspaceSlug);

  const groupedByMonth =
    module.displayType === "timeline"
      ? items.reduce<Record<string, typeof items>>((accumulator, item) => {
          const month = new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "long",
          }).format(new Date(item.publishedAt));
          accumulator[month] ??= [];
          accumulator[month].push(item);
          return accumulator;
        }, {})
      : null;

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">{module.shortLabel}</p>
          <h1 className="mt-2 text-4xl text-t1">{module.name}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-t2">{module.description}</p>
          {(searchParams.category || searchParams.tag) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {searchParams.category && (
                <span className="rounded-full bg-[var(--tag-bg)] px-3 py-2 text-sm text-[var(--tag-c)]">
                  分类：{items[0]?.categoryName ?? searchParams.category}
                </span>
              )}
              {searchParams.tag && (
                <span className="rounded-full bg-[var(--tag-bg)] px-3 py-2 text-sm text-[var(--tag-c)]">
                  标签：#{searchParams.tag}
                </span>
              )}
            </div>
          )}
        </div>

        {module.displayType === "timeline" && groupedByMonth ? (
          <div className="mt-6 space-y-8">
            {Object.entries(groupedByMonth).map(([month, monthItems]) => (
              <section key={month}>
                <h2 className="mb-4 text-lg uppercase tracking-[0.18em] text-t3">{month}</h2>
                <div className="relative pl-8 before:absolute before:left-3.5 before:top-1 before:h-[calc(100%-0.5rem)] before:w-px before:bg-border">
                  {monthItems.map((item) => (
                    <div className="relative mb-4" key={item.id}>
                      <span
                        className="absolute -left-[1.9rem] top-5 h-3 w-3 rounded-full border-2 border-bg"
                        style={{ backgroundColor: module.accent }}
                      />
                      <ContentCard item={item} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-t3">
                当前模块还没有导入内容。先执行 Markdown 导入脚本，再刷新这里。
              </div>
            ) : (
              items.map((item) => <ContentCard item={item} key={item.id} />)
            )}
          </div>
        )}
      </div>
    </section>
  );
}
