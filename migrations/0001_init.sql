-- ============================================================
-- 域名分发 初始迁移
-- 数据库引擎：Cloudflare D1 (SQLite)
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  github_id INTEGER UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'banned')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_id);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 域名表
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subdomain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'pending')),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_custom INTEGER NOT NULL DEFAULT 0,
  custom_host TEXT NOT NULL DEFAULT '',
  dns_record_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domains_user ON domains(user_id);
CREATE INDEX IF NOT EXISTS idx_domains_subdomain ON domains(subdomain);

-- 页面表
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  content TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'default',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain_id);

-- API Key 表
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  last_used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- 验证码表
CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify', 'reset')),
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codes_email ON codes(email);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- API 使用统计表
CREATE TABLE IF NOT EXISTS api_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_user ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage(created_at);

-- 默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('platform_name', '域名分发'),
  ('ai_model', '@cf/meta/llama-3.1-8b-instruct'),
  ('ai_embedding_model', '@cf/baai/bge-small-en-v1.5'),
  ('allow_registration', 'true'),
  ('email_provider', 'api'),
  ('email_from', 'noreply@yourdomain.com'),
  ('email_config', '{}'),
  ('admin_created', '0');CREATE INDEX IF NOT EXISTS idx_usage_user ON api_usage(user_id);\nCREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage(created_at);\n\n-- 默认设置\nINSERT OR IGNORE INTO settings (key, value) VALUES\n  ('platform_name', '域名分发'),\n  ('ai_model', '@cf/meta/llama-3.1-8b-instruct'),\n  ('ai_embedding_model', '@cf/baai/bge-small-en-v1.5'),\n  ('allow_registration', 'true'),\n  ('email_provider', 'api'),\n  ('email_from', 'noreply@yourdomain.com'),\n  ('email_config', '{}'),\n  ('admin_created', '0');\n"}]