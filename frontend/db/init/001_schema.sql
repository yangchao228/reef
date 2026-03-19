CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS repo_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  github_owner VARCHAR(100) NOT NULL DEFAULT 'local',
  github_repo VARCHAR(100) NOT NULL DEFAULT 'local',
  watch_paths TEXT[] NOT NULL DEFAULT '{}',
  display_type VARCHAR(50) NOT NULL,
  is_public BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repo_registry(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id),
  file_path TEXT NOT NULL,
  github_sha VARCHAR(40) NOT NULL DEFAULT '',
  slug VARCHAR(500) NOT NULL,
  title TEXT,
  summary TEXT,
  content_raw TEXT NOT NULL,
  frontmatter JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  source_platform VARCHAR(50),
  view_count INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'published',
  UNIQUE(repo_id, file_path),
  UNIQUE(repo_id, slug)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repo_registry(id),
  trigger_type VARCHAR(20) NOT NULL,
  commit_sha VARCHAR(40),
  files_added INTEGER DEFAULT 0,
  files_modified INTEGER DEFAULT 0,
  files_removed INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  error_detail TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_item_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS comment_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname VARCHAR(100) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  author_id UUID REFERENCES comment_authors(id),
  body TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  fingerprint VARCHAR(64) NOT NULL,
  bucket_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_item_id, fingerprint, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_content_items_repo_published
  ON content_items(repo_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_category
  ON content_items(category_id);

CREATE INDEX IF NOT EXISTS idx_comments_item_status_created
  ON comments(content_item_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_repo_started
  ON sync_logs(repo_id, started_at DESC);
