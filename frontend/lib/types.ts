export type ModuleSlug = "human30" | "openclaw" | "bookmarks";

export type DisplayType = "blog" | "timeline" | "bookmarks";

export type SourcePlatform =
  | "wechat"
  | "xiaohongshu"
  | "youtube"
  | "x"
  | "rss";

export interface ModuleDefinition {
  slug: ModuleSlug;
  name: string;
  shortLabel: string;
  description: string;
  displayType: DisplayType;
  accent: string;
  href: `/${ModuleSlug}`;
}

export interface ContentStats {
  views: number;
  likes: number;
  comments: number;
}

export interface ContentItem {
  id: string;
  module: ModuleSlug;
  slug: string;
  title: string;
  summary: string;
  category: string;
  categoryName?: string;
  tags: string[];
  publishedAt: string;
  content: string[];
  stats: ContentStats;
  sourceUrl?: string;
  sourcePlatform?: SourcePlatform;
}

export interface CategorySummary {
  slug: string;
  name: string;
  count: number;
  modules: ModuleSlug[];
}

export interface CommentRecord {
  id: string;
  slug: string;
  nickname: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface AdminCommentRecord extends CommentRecord {
  module: ModuleSlug;
  title: string;
}

export interface AdminSyncLogRecord {
  id: string;
  module: ModuleSlug;
  repoName: string;
  triggerType: "webhook" | "cron" | "manual";
  commitSha?: string;
  filesAdded: number;
  filesModified: number;
  filesRemoved: number;
  status: "pending" | "completed" | "failed";
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}
