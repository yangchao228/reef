import Link from "next/link";

import { listModules } from "@/lib/content-repository";
import { getRequestUserLogin } from "@/lib/user-session";
import { getRequestWorkspaceSlug, WORKSPACE_DIRECTORY_PATH } from "@/lib/workspace";
import { getWorkspaceSummary } from "@/lib/workspace-repository";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export async function Navbar() {
  const workspaceSlug = getRequestWorkspaceSlug();
  const currentUserLogin = getRequestUserLogin();
  const [navItems, workspace] = await Promise.all([
    listModules(workspaceSlug),
    getWorkspaceSummary(workspaceSlug),
  ]);

  const topNavItems = navItems.slice(0, 4).map((module) => ({
    href: module.href,
    label: module.name,
  }));

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link className="flex items-center gap-3" href="/">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-bg-card text-sm text-pri shadow-glow">
            ◌
          </span>
          <div className="leading-none">
            <span className="block font-display text-xl tracking-[-0.03em] text-[var(--logo-color)]">
              Reef
            </span>
            <span className="block pt-1 text-[10px] uppercase tracking-[0.3em] text-t3">
              GitHub-native OS
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {workspace ? (
            <Link
              className="rounded-full border border-pri/20 bg-bg-card px-3 py-2 text-xs uppercase tracking-[0.18em] text-pri-d transition hover:border-pri/50"
              href={WORKSPACE_DIRECTORY_PATH}
            >
              {workspace.name}
            </Link>
          ) : (
            <Link
              className="rounded-full border border-border px-3 py-2 text-xs uppercase tracking-[0.18em] text-t3 transition hover:border-pri hover:text-t1"
              href={WORKSPACE_DIRECTORY_PATH}
            >
              选择空间
            </Link>
          )}
          {topNavItems.map((item) => (
            <Link
              className="text-sm text-t2 transition hover:text-t1"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            className="rounded-full border border-border px-3 py-2 text-xs text-t2 transition hover:border-pri hover:text-t1"
            href={WORKSPACE_DIRECTORY_PATH}
          >
            {currentUserLogin ? `@${currentUserLogin}` : "登录"}
          </Link>
          <Link
            className="rounded-full border border-border px-3 py-2 text-xs text-t2 transition hover:border-pri hover:text-t1"
            href={WORKSPACE_DIRECTORY_PATH}
          >
            空间
          </Link>
          <Link
            className="rounded-full border border-border px-3 py-2 text-xs text-t2 transition hover:border-pri hover:text-t1"
            href="/about"
          >
            关于我
          </Link>
        </div>
      </div>
    </header>
  );
}
