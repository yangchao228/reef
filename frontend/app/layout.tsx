import type { Metadata } from "next";
import { ReactNode } from "react";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { ThemeProvider } from "@/components/ui/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Reef",
  description: "GitHub-native 个人内容系统的纯 Next.js 首版原型。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>
          <div className="min-h-screen bg-bg text-t1">
            <Navbar />
            <main>{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
