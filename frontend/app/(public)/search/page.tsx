import { ContentCard } from "@/components/content/content-card";
import { searchContent } from "@/lib/content-repository";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q?.trim() ?? "";
  const items = query ? await searchContent(query) : [];

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Search</p>
          <h1 className="mt-2 text-4xl text-t1">搜索</h1>
          <form className="mt-6">
            <input
              className="w-full rounded-2xl border border-border bg-bg px-4 py-4 text-base text-t1 outline-none placeholder:text-t4 focus:border-pri"
              defaultValue={query}
              name="q"
              placeholder="输入模块、标题、标签或摘要关键词"
            />
          </form>
        </div>
        <div className="mt-6">
          {query ? (
            <>
              <p className="mb-4 text-sm text-t3">找到 {items.length} 条结果</p>
              <div className="grid gap-4 lg:grid-cols-2">
                {items.map((item) => (
                  <ContentCard item={item} key={item.id} />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-t3">
              输入关键词后开始检索。当前版本使用数据库查询，后续再接入 Pagefind 做静态搜索索引。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
