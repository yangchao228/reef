import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-t3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Reef · GitHub 驱动的个人内容系统原型</p>
        <div className="flex gap-4">
          <Link className="transition hover:text-t1" href="/search">
            搜索
          </Link>
          <Link className="transition hover:text-t1" href="/about">
            关于我
          </Link>
          <Link className="transition hover:text-t1" href="/admin">
            后台
          </Link>
        </div>
      </div>
    </footer>
  );
}
