import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CommentsPanel } from "@/components/content/comments-panel";
import { InteractionBar } from "@/components/content/interaction-bar";
import {
  getApprovedComments,
  getContentByModuleAndSlug,
  getModuleMeta,
} from "@/lib/content-repository";
import { decodeRouteParam } from "@/lib/route-param";
import {
  buildWorkspaceDirectoryHref,
  getRequestWorkspaceSlug,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: {
  params: { module: string; slug: string };
}) {
  const decodedSlug = decodeRouteParam(params.slug);
  const workspaceSlug = getRequestWorkspaceSlug();
  if (!workspaceSlug) {
    redirect(
      buildWorkspaceDirectoryHref(
        `/${params.module}/${encodeURIComponent(decodedSlug)}`,
      ),
    );
  }

  const item = await getContentByModuleAndSlug(
    params.module,
    decodedSlug,
    workspaceSlug,
  );
  if (!item) {
    notFound();
  }

  const module = await getModuleMeta(params.module, workspaceSlug);
  const comments = await getApprovedComments(item.slug, workspaceSlug);

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <article className="mx-auto max-w-4xl">
        <div className="rounded-[32px] border border-border bg-bg-card p-6 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              style={{
                backgroundColor: `${module?.accent ?? "#1D9E75"}1A`,
                color: module?.accent ?? "#1D9E75",
              }}
            >
              {module?.shortLabel}
            </span>
            <Link
              className="rounded-full border border-border px-3 py-1 text-xs text-t3 transition hover:text-t1"
              href={`/categories/${item.category}`}
            >
              {item.categoryName ?? item.category}
            </Link>
          </div>

          <h1 className="mt-5 text-4xl leading-tight text-t1 sm:text-5xl">{item.title}</h1>
          <p className="mt-4 text-base leading-8 text-t2">{item.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <Link
                className="rounded-full border border-border px-3 py-1 text-xs text-t3 transition hover:border-pri hover:text-t1"
                href={`/tags/${tag}`}
                key={tag}
              >
                #{tag}
              </Link>
            ))}
          </div>

          {item.sourceUrl && (
            <div className="mt-8 rounded-2xl border border-border bg-bg p-4 text-sm text-t2">
              外部来源：
              <a
                className="ml-2 text-pri underline decoration-transparent transition hover:decoration-current"
                href={item.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {item.sourceUrl}
              </a>
            </div>
          )}

          <div className="mt-8 space-y-6 text-base leading-8 text-t2">
            {item.content.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <InteractionBar
            initialLikes={item.stats.likes}
            initialViews={item.stats.views}
            slug={item.slug}
          />
        </div>

        {module?.displayType !== "bookmarks" && (
          <CommentsPanel comments={comments} slug={item.slug} />
        )}
      </article>
    </section>
  );
}
