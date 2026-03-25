CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Reef v2 multitenant target schema.
-- This is the only supported runtime schema for current development and CI.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_user_id BIGINT UNIQUE,
  github_login VARCHAR(100) UNIQUE,
  name VARCHAR(200),
  avatar_url TEXT,
  email VARCHAR(320),
  account_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS github_app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_installation_id BIGINT NOT NULL UNIQUE,
  github_account_login VARCHAR(100) NOT NULL,
  github_account_type VARCHAR(20) NOT NULL
    CHECK (github_account_type IN ('user', 'organization')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  events TEXT[] NOT NULL DEFAULT '{}',
  installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, github_account_login),
  UNIQUE (id, workspace_id)
);

CREATE TABLE IF NOT EXISTS repo_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  github_owner VARCHAR(100) NOT NULL DEFAULT 'local',
  github_repo VARCHAR(100) NOT NULL DEFAULT 'local',
  github_app_installation_id UUID REFERENCES github_app_installations(id),
  watch_paths TEXT[] NOT NULL DEFAULT '{}',
  display_type VARCHAR(50) NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slug),
  UNIQUE (workspace_id, github_owner, github_repo),
  UNIQUE (id, workspace_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slug),
  UNIQUE (id, workspace_id)
);

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_id UUID NOT NULL,
  category_id UUID,
  file_path TEXT NOT NULL,
  github_sha VARCHAR(40) NOT NULL DEFAULT '',
  slug VARCHAR(500) NOT NULL,
  title TEXT,
  summary TEXT,
  content_raw TEXT NOT NULL,
  frontmatter JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT,
  source_platform VARCHAR(50),
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  FOREIGN KEY (repo_id, workspace_id)
    REFERENCES repo_registry(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, workspace_id)
    REFERENCES categories(id, workspace_id),
  UNIQUE (repo_id, file_path),
  UNIQUE (repo_id, slug),
  UNIQUE (id, workspace_id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_id UUID NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,
  trigger_scope VARCHAR(40),
  commit_sha VARCHAR(40),
  files_added INTEGER NOT NULL DEFAULT 0,
  files_modified INTEGER NOT NULL DEFAULT 0,
  files_removed INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_detail TEXT,
  failure_category VARCHAR(50),
  recovery_action VARCHAR(50),
  compensation_run_id UUID,
  is_retryable BOOLEAN NOT NULL DEFAULT false,
  operator_summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  FOREIGN KEY (repo_id, workspace_id)
    REFERENCES repo_registry(id, workspace_id) ON DELETE CASCADE
);

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS trigger_scope VARCHAR(40);

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS failure_category VARCHAR(50);

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS recovery_action VARCHAR(50);

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS compensation_run_id UUID;

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS is_retryable BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS operator_summary TEXT;

CREATE TABLE IF NOT EXISTS comment_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nickname VARCHAR(100) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Repository writes must move from ON CONFLICT (fingerprint)
  -- to ON CONFLICT (workspace_id, fingerprint).
  UNIQUE (workspace_id, fingerprint),
  UNIQUE (id, workspace_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES content_items(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id, workspace_id)
    REFERENCES comment_authors(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES content_items(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, content_item_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  bucket_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES content_items(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, content_item_id, fingerprint, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
  ON workspaces(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON workspace_members(user_id);

CREATE INDEX IF NOT EXISTS idx_github_app_installations_workspace
  ON github_app_installations(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_repo_registry_workspace_sort
  ON repo_registry(workspace_id, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_categories_workspace_sort
  ON categories(workspace_id, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_published
  ON content_items(workspace_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_category_published
  ON content_items(workspace_id, category_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_repo_published
  ON content_items(workspace_id, repo_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_workspace_started
  ON sync_logs(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_workspace_compensation_started
  ON sync_logs(workspace_id, compensation_run_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_workspace_trigger_scope_started
  ON sync_logs(workspace_id, trigger_scope, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_workspace_status_created
  ON comments(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_workspace_item_created
  ON likes(workspace_id, content_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_view_events_workspace_item_bucket
  ON view_events(workspace_id, content_item_id, bucket_date DESC);

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_workspaces_set_updated_at ON workspaces;
CREATE TRIGGER trg_workspaces_set_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_github_app_installations_set_updated_at
ON github_app_installations;
CREATE TRIGGER trg_github_app_installations_set_updated_at
BEFORE UPDATE ON github_app_installations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
