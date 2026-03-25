import { DisplayType, ModuleDefinition } from "@/lib/types";

type ModulePreset = {
  shortLabel: string;
  description: string;
  accent: string;
  icon: string;
};

type ModuleMetaInput = {
  description?: string;
  shortLabel?: string;
  accent?: string;
  icon?: string;
};

const defaultPreset: ModulePreset = {
  shortLabel: "MODULE",
  description: "基于当前 workspace 动态加载的内容模块。",
  accent: "#1D9E75",
  icon: "•",
};

const displayTypePresets: Record<DisplayType, ModulePreset> = {
  blog: {
    shortLabel: "BLOG",
    description: "按文章流组织的结构化内容模块。",
    accent: "#1D9E75",
    icon: "H",
  },
  timeline: {
    shortLabel: "TIMELINE",
    description: "按时间轴记录项目推进、过程偏差与迭代判断。",
    accent: "#5DCAA5",
    icon: "时",
  },
  bookmarks: {
    shortLabel: "BOOKMARKS",
    description: "沉淀可检索、可复用的链接、工具和样本索引。",
    accent: "#9FE1CB",
    icon: "↗",
  },
};

const slugPresets: Record<string, Partial<ModulePreset>> = {
  human30: {
    shortLabel: "HUMAN 3.0",
    description: "面向认知主权、方法系统与长期主义的结构化专栏。",
    accent: "#1D9E75",
    icon: "H",
  },
  openclaw: {
    shortLabel: "养虾宇宙",
    description: "按时间轴记录产品推进、现场偏差与迭代判断。",
    accent: "#5DCAA5",
    icon: "虾",
  },
  bookmarks: {
    shortLabel: "BOOKMARKS",
    description: "把值得反复调用的链接、工具和样本沉淀成可检索的索引。",
    accent: "#9FE1CB",
    icon: "↗",
  },
};

function normalizeMeta(meta: unknown): ModuleMetaInput {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }

  return meta as ModuleMetaInput;
}

export function buildModuleDefinition(input: {
  slug: string;
  name: string;
  displayType: DisplayType;
  meta?: unknown;
}): ModuleDefinition {
  const displayPreset = displayTypePresets[input.displayType] ?? defaultPreset;
  const slugPreset = slugPresets[input.slug] ?? {};
  const meta = normalizeMeta(input.meta);

  return {
    slug: input.slug,
    name: input.name,
    shortLabel:
      meta.shortLabel ?? slugPreset.shortLabel ?? displayPreset.shortLabel,
    description:
      meta.description ?? slugPreset.description ?? displayPreset.description,
    displayType: input.displayType,
    accent: meta.accent ?? slugPreset.accent ?? displayPreset.accent,
    href: `/${input.slug}`,
    icon: meta.icon ?? slugPreset.icon ?? displayPreset.icon,
  };
}
