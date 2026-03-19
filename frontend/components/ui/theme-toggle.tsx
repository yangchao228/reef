"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      aria-label="切换主题"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-soft px-2 py-1 text-xs text-t2 transition hover:border-pri hover:text-t1"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      <span className={isDark ? "opacity-45" : "opacity-100"}>☀</span>
      <span className="relative h-[18px] w-8 rounded-full bg-border dark:bg-pri">
        <span
          className={`absolute top-0.5 h-[14px] w-[14px] rounded-full bg-bg-card transition-transform ${
            isDark ? "translate-x-[17px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className={isDark ? "opacity-100" : "opacity-45"}>☽</span>
    </button>
  );
}
