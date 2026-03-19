import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-11 pt-14 sm:px-8 sm:pt-16">
      <div className="absolute inset-x-8 top-0 -z-10 h-44 rounded-full bg-[radial-gradient(circle_at_center,_rgba(29,158,117,0.18),_transparent_65%)] dark:bg-[radial-gradient(circle_at_center,_rgba(201,168,76,0.16),_transparent_65%)]" />
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-[var(--pill-g-bg)] px-4 py-2 text-xs tracking-[0.18em] text-[var(--pill-g-c)]">
          <span className="h-2 w-2 rounded-full bg-pri" />
          Human 3.0 · 个人数字系统
        </div>
        <h1 className="mt-6 font-display text-5xl leading-[0.95] tracking-[-0.05em] text-t1 sm:text-6xl">
          GitHub 是硬盘
          <br />
          Reef 是它的操作系统界面
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-t2 sm:text-lg">
          首版以纯 Next.js 单体实现内容首页、模块浏览、分类检索与互动原型。
          结构先成立，再把同步、鉴权和持久化逐步替换成正式服务。
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            className="rounded-lg bg-pri-d px-6 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
            href="/human30"
          >
            进入专栏
          </Link>
          <Link
            className="rounded-lg border border-pri-l px-6 py-3 text-sm text-pri-d transition hover:bg-bg-card"
            href="/search?q=system"
          >
            浏览系统主题
          </Link>
        </div>
      </div>
    </section>
  );
}
