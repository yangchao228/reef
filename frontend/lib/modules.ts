import { ModuleDefinition } from "@/lib/types";

export const modules: ModuleDefinition[] = [
  {
    slug: "human30",
    name: "Human 3.0 专栏",
    shortLabel: "HUMAN 3.0",
    description: "面向认知主权、方法系统与长期主义的结构化专栏。",
    displayType: "blog",
    accent: "#1D9E75",
    href: "/human30",
  },
  {
    slug: "openclaw",
    name: "养虾日记",
    shortLabel: "养虾宇宙",
    description: "按时间轴记录产品推进、现场偏差与迭代判断。",
    displayType: "timeline",
    accent: "#5DCAA5",
    href: "/openclaw",
  },
  {
    slug: "bookmarks",
    name: "收藏夹",
    shortLabel: "BOOKMARKS",
    description: "把值得反复调用的链接、工具和样本沉淀成可检索的索引。",
    displayType: "bookmarks",
    accent: "#9FE1CB",
    href: "/bookmarks",
  },
];

export function getModuleBySlug(slug: string) {
  return modules.find((module) => module.slug === slug);
}
