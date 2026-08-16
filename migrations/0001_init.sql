-- ============================================================
-- cf-platform 初始迁移
-- 数据库引擎：Cloudflare D1 (SQLite)
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                       -- 邮箱注册用户才有；GitHub 登录用户为 NULL
  name          TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'user', -- user | admin
  github_id     INTEGER,
  status        TEXT NOT NULL DEFAULT 'active', -- active | banned
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);

-- 会话表（也可只用 KV；这里用 D1 做持久化审计，KV 做快速校验）
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,              -- 即 refresh token
  user_id    TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 邮箱验证码 / 密码重置码（一次性）
CREATE TABLE IF NOT EXISTS codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,                 -- verify | reset
  code       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codes_email ON codes(email);

-- 子域名 / 站点
CREATE TABLE IF NOT EXISTS domains (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  subdomain  TEXT NOT NULL UNIQUE,          -- 如 "alice"
  status     TEXT NOT NULL DEFAULT 'active',-- active | suspended | pending
  title      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_custom  INTEGER NOT NULL DEFAULT 0,    -- 0=平台子域名 1=自定义域名
  custom_host TEXT NOT NULL DEFAULT '',     -- 自定义域名时填
  dns_record_id TEXT NOT NULL DEFAULT '',   -- Cloudflare DNS 记录 id（自定义域名用）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_domains_user ON domains(user_id);
CREATE INDEX IF NOT EXISTS idx_domains_subdomain ON domains(subdomain);

-- 站点页面内容（每个子域名一个可编辑页面）
CREATE TABLE IF NOT EXISTS pages (
  id         TEXT PRIMARY KEY,
  domain_id  TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',      -- Markdown / HTML
  theme      TEXT NOT NULL DEFAULT 'default',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- 外接 API Key
CREATE TABLE IF NOT EXISTS api_keys (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  key_prefix TEXT NOT NULL,                 -- 明文前 8 位用于展示
  key_hash   TEXT NOT NULL,                 -- 完整 key 的 sha256
  scopes     TEXT NOT NULL DEFAULT '[]',    -- JSON 数组
  last_used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);

-- 通用设置（站点名、AI 模型、邮件配置等均存这里，JSON 值）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 审计日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  details    TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- API 调用计数（用于仪表盘统计）
CREATE TABLE IF NOT EXISTS api_usage (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL DEFAULT '',
  endpoint   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage(created_at);

-- ─── 默认设置 ──────────────────────────────────────────────
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('platform_name', 'CF Platform'),
  ('ai_model', '@cf/meta/llama-3.1-8b-instruct'),
  ('ai_embedding_model', '@cf/baai/bge-small-en-v1.5'),
  ('allow_registration', 'true'),
  ('email_provider', 'api'),                 -- api | smtp | none
  ('email_config', '{}'),                    -- JSON: SMTP/API 凭据
  ('email_from', 'noreply@yourdomain.com'),
  ('default_page_template', '# Welcome\n\nThis is your page. Edit it from the dashboard.');
