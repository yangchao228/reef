export type ModuleSlug = string;

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
  href: string;
  icon: string;
}

export interface ContentStats {
  views: number;
  likes: number;
  comments: number;
}

export interface ContentItem {
  id: string;
  module: ModuleSlug;
  moduleMeta: ModuleDefinition;
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
  modules: string[];
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
  failureCategory?: string;
  recoveryAction?: string;
  compensationRunId?: string;
  isRetryable?: boolean;
  operatorSummary?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface WorkspaceSummary {
  slug: string;
  name: string;
  description?: string;
  visibility: "public" | "private";
  contentCount: number;
  moduleCount: number;
  updatedAt: string;
  membershipRole?: "owner" | "admin" | "editor" | "viewer";
}

export interface UserSummary {
  githubLogin: string;
  name?: string;
  workspaceCount: number;
}

export interface GitHubAppInstallationSummary {
  id: string;
  githubInstallationId: number;
  githubAccountLogin: string;
  githubAccountType: "user" | "organization";
  permissions: Record<string, unknown>;
  events: string[];
  updatedAt: string;
}

export interface AdminModuleBindingRecord {
  id: string;
  slug: string;
  name: string;
  githubOwner: string;
  githubRepo: string;
  branch: string;
  watchPaths: string[];
  recentSync?: {
    status: "pending" | "completed" | "failed";
    triggerType: "webhook" | "cron" | "manual";
    startedAt: string;
    finishedAt?: string;
    errorCode?: string;
    errorMessage?: string;
    failureCategory?: string;
    recoveryAction?: string;
    compensationRunId?: string;
    isRetryable?: boolean;
    operatorSummary?: string;
  };
  currentInstallation?: {
    id: string;
    githubInstallationId: number;
    githubAccountLogin: string;
  };
}
