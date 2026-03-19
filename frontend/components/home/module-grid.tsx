import Link from "next/link";

import { listModuleContent } from "@/lib/content-repository";
import { modules } from "@/lib/modules";

export async function ModuleGrid() {
  const counts = await Promise.all(
    modules.map(async (module) => ({
      module: module.slug,
      count: (await listModuleContent(module.slug)).length,
    })),
  );

  return (
    <section className="px-5 pb-10 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-3">
        {modules.map((module) => {
          const count = counts.find((item) => item.module === module.slug)?.count ?? 0;
          return (
            <Link
              className="group rounded-2xl border border-border bg-bg-card p-5 transition hover:-translate-y-0.5 hover:border-pri/60"
              href={module.href}
              key={module.slug}
              style={{ borderTop: `2px solid ${module.accent}` }}
            >
              <div
                className="grid h-10 w-10 place-items-center rounded-2xl text-sm text-t1"
                style={{ backgroundColor: `${module.accent}1A` }}
              >
                {module.slug === "human30" ? "H" : module.slug === "openclaw" ? "虾" : "↗"}
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-t3">
                {module.shortLabel}
              </p>
              <h2 className="mt-2 text-lg text-t1">{module.name}</h2>
              <p className="mt-3 min-h-16 text-sm leading-7 text-t2">
                {module.description}
              </p>
              <div className="mt-6 flex items-center justify-between text-sm text-t3">
                <span>{count} 条内容</span>
                <span className="transition group-hover:translate-x-1">进入模块 →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
