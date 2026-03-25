import Link from "next/link";
import { redirect } from "next/navigation";

import { listCategories } from "@/lib/content-repository";
import {
  buildWorkspaceDirectoryHref,
  getRequestWorkspaceSlug,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const workspaceSlug = getRequestWorkspaceSlug();
  if (!workspaceSlug) {
    redirect(buildWorkspaceDirectoryHref("/categories"));
  }

  const categories = await listCategories(workspaceSlug);

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Categories</p>
          <h1 className="mt-2 text-4xl text-t1">全站分类</h1>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <Link
              className="rounded-2xl border border-border bg-bg-card p-5 transition hover:border-pri/60"
              href={`/categories/${category.slug}`}
              key={category.slug}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl text-t1">{category.name}</h2>
                <span className="text-sm text-t3">{category.count}</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-t2">
                模块来源：{category.modules.join(" · ")}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
