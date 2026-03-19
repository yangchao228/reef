import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { listItemsByTag } from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";

export const dynamic = "force-dynamic";

export default async function TagDetailPage({ params }: { params: { tag: string } }) {
  const tag = decodeRouteParam(params.tag);
  const items = await listItemsByTag(tag);
  if (items.length === 0) {
    notFound();
  }

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Tag</p>
          <h1 className="mt-2 text-4xl text-t1">#{tag}</h1>
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
