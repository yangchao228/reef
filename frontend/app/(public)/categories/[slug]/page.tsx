import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { getCategoryName, listItemsByCategory } from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({ params }: { params: { slug: string } }) {
  const categorySlug = decodeRouteParam(params.slug);
  const items = await listItemsByCategory(categorySlug);
  if (items.length === 0) {
    notFound();
  }

  const categoryName = await getCategoryName(categorySlug);

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Category</p>
          <h1 className="mt-2 text-4xl text-t1">{categoryName}</h1>
          <p className="mt-4 text-sm leading-7 text-t2">跨模块聚合的分类视图。</p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <ContentCard item={item} key={item.id} />
          ))}
        </div>
      </div>
    </section>
  );
}
