# CF Platform · Cloudflare 全栈 SaaS 平台

> 基于 Cloudflare Workers 的全栈 SaaS 平台：二级域名分发、管理后台、OAuth/邮箱登录、外接 API、MCP 接入，一键 GitHub Actions 部署。

A full-stack SaaS platform built on Cloudflare Workers: subdomain distribution, admin panel, OAuth/email login, external API, MCP server, and one-click GitHub Actions deployment.

---

## ✨ 功能特性 / Features

| 中文 | English |
|------|---------|
| **Cloudflare 原生** — 单 Worker 承载，集成 D1 / KV / R2 / Workers AI | **Cloudflare-native** — Single Worker with D1 / KV / R2 / Workers AI bindings |
| **二级域名分发** — 自动创建/删除 DNS 记录，子域名即子站点 | **Subdomain distribution** — Auto-manage DNS records, each subdomain is a subsite |
| **完整管理后台** — 仪表盘、用户、域名、API Key、邮件、审计日志、设置 | **Full admin panel** — Dashboard, users, domains, API keys, email, audit logs, settings |
| **注册登录系统** — 邮箱密码（bcrypt + JWT）+ GitHub OAuth 第三方登录 | **Auth system** — Email/password (bcrypt + JWT) + GitHub OAuth |
| **GitHub Actions 自动部署** — 推送 main 分支即自动迁移 + 部署 | **GitHub Actions CI/CD** — Push to main triggers auto-migration + deploy |
| **外接 API** — `/api/v1/*`，API Key 鉴权，支持 AI 聊天/嵌入 | **External API** — `/api/v1/*` with API Key auth, AI chat/embeddings |
| **MCP 接入** — JSON-RPC 2.0 Server，兼容 Claude Desktop / Cursor 等 | **MCP Server** — JSON-RPC 2.0, compatible with Claude Desktop / Cursor |
| **邮件双模式** — SMTP（cloudflare:sockets）或 HTTP API（Resend 等） | **Dual email mode** — SMTP (cloudflare:sockets) or HTTP API (Resend etc.) |

---

## 🏗️ 技术栈 / Tech Stack

| 组件 | 技术 |
|------|------|
| 运行时 / Runtime | Cloudflare Workers |
| Web 框架 / Framework | [Hono](https://hono.dev) |
| 数据库 / Database | Cloudflare D1 (SQLite) |
| KV 存储 / KV Store | Cloudflare KV |
| 对象存储 / Object Storage | Cloudflare R2 |
| AI 推理 / AI Inference | Cloudflare Workers AI |
| 认证 / Auth | JWT (`@tsndr/cloudflare-worker-jwt`) + bcrypt |
| 前端 / Frontend | Hono JSX + Alpine.js + Tailwind CSS (CDN) |
| 部署 / Deploy | GitHub Actions + Wrangler |

---

## 📁 项目结构 / Project Structure

```
cf-platform/
├── .github/workflows/deploy.yml   # GitHub Actions 自动部署
├── migrations/0001_init.sql       # D1 数据库迁移
├── public/robots.txt              # 静态资源
├── scripts/setup.mjs              # 一键初始化 Cloudflare 资源
├── src/
│   ├── lib/
│   │   ├── ai.ts                  # Workers AI 封装
│   │   ├── auth.ts                # JWT 认证 + bcrypt
│   │   ├── db.ts                  # D1 数据访问层
│   │   ├── dns.ts                 # Cloudflare DNS API
│   │   ├── email.ts               # 邮件发送（SMTP + API）
│   │   ├── mcp.ts                 # MCP JSON-RPC Server
│   │   └── utils.ts               # 工具函数
│   ├── middleware/index.ts        # auth / admin / tenant / rateLimit
│   ├── routes/
│   │   ├── auth.ts                # 注册/登录/GitHub OAuth
│   │   ├── account.ts             # 用户账户管理
│   │   ├── admin.ts               # 管理后台 API
│   │   ├── api.ts                 # 外接 API (/api/v1/*)
│   │   ├── mcp.ts                 # MCP 端点 (/mcp)
│   │   └── pages.tsx             # 落地页/登录页/租户页
│   ├── ui/
│   │   ├── admin.tsx              # 管理后台 SPA
│   │   └── layout.tsx             # HTML 布局
│   ├── env.ts                     # 环境类型定义
│   └── index.tsx                  # 主入口
├── .dev.vars.example              # 本地开发密钥模板
├── package.json
├── tsconfig.json
└── wrangler.toml                  # Cloudflare Workers 配置
```

---

## 🚀 快速开始 / Quick Start

### 前置条件 / Prerequisites

- Node.js 20+
- Cloudflare 账户（免费套餐即可 / Free tier works）
- GitHub 账户
- 一个域名（已托管在 Cloudflare / Hosted on Cloudflare）

### 1. 克隆仓库 / Clone

```bash
git clone https://github.com/mumu78928/cf-platform.git
cd cf-platform
npm install
```

### 2. 初始化 Cloudflare 资源 / Initialize Cloudflare Resources

```bash
npx wrangler login
node scripts/setup.mjs
```

This creates D1 database, KV namespace, and R2 bucket, then fills IDs into `wrangler.toml`.

（此脚本会自动创建 D1 数据库、KV 命名空间、R2 bucket，并将 ID 回填到 `wrangler.toml`。）

### 3. 配置密钥 / Configure Secrets

Copy `.dev.vars.example` to `.dev.vars` and fill in values:

```bash
cp .dev.vars.example .dev.vars
```

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（任意长随机串）|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `CF_API_TOKEN` | Cloudflare API Token（权限：Zone:DNS:Edit）|
| `CF_ZONE_ID` | 主域名 Zone ID |

> **GitHub OAuth App**: Create at https://github.com/settings/developers
> Callback URL: `https://yourdomain.com/auth/github/callback`

### 4. 修改域名配置 / Update Domain Config

Edit `wrangler.toml`, replace `yourdomain.com` with your actual domain:

```toml
[vars]
BASE_DOMAIN = "yourdomain.com"
BOOTSTRAP_ADMIN_EMAIL = "admin@yourdomain.com"

routes = [
  { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" },
  { pattern = "*.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

### 5. 本地开发 / Local Development

```bash
npm run db:migrate:local    # 应用本地迁移
npm run dev                  # 启动开发服务器
```

### 6. 部署 / Deploy

#### 方式一：GitHub Actions 自动部署（推荐）/ Method 1: GitHub Actions (Recommended)

1. Push code to GitHub `main` branch
2. In repo **Settings → Secrets and variables → Actions**, configure:

**Secrets:**
| Name | Description |
|------|-------------|
| `CLOUDFLARE_API_TOKEN` | CF API Token (Workers Scripts:Edit, D1:Edit, KV:Edit, R2:Edit, AI:Edit, Zone:DNS:Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | CF Account ID |
| `D1_DATABASE_ID` | D1 database ID |
| `KV_NAMESPACE_ID` | KV namespace ID |
| `JWT_SECRET` | JWT signing secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `CF_API_TOKEN` | CF API Token for DNS management |
| `CF_ZONE_ID` | Main domain zone ID |

**Variables:**
| Name | Example |
|------|---------|
| `BASE_DOMAIN` | `yourdomain.com` |
| `PLATFORM_NAME` | `CF Platform` |
| `JWT_ISSUER` | `cf-platform` |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@yourdomain.com` |

3. Push to `main` → auto deploys

#### 方式二：手动部署 / Method 2: Manual Deploy

```bash
npx wrangler d1 migrations apply cf-platform --remote
npx wrangler secret put JWT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ZONE_ID
npm run deploy
```

### 7. DNS 配置 / DNS Setup

In Cloudflare DNS, add a wildcard record:

| Type | Name | Content | Proxied |
|------|------|---------|---------|
| A | `*` | `192.0.2.1` | ✅ |

Then add Worker routes in Cloudflare Dashboard:
- `yourdomain.com/*`
- `*.yourdomain.com/*`

---

## 📖 使用指南 / Usage Guide

### 管理后台 / Admin Panel

Visit `https://yourdomain.com/admin` — first registered user with `BOOTSTRAP_ADMIN_EMAIL` becomes admin.

（访问 `https://yourdomain.com/admin` — 首次注册 `BOOTSTRAP_ADMIN_EMAIL` 邮箱的用户自动成为管理员。）

**功能模块：**
- **仪表盘** — 用户数、域名数、API 调用统计
- **用户管理** — 查看/封禁/解封用户，修改角色
- **域名管理** — 查看/暂停/删除子域名
- **API Key** — 创建/撤销 API Key，设置权限范围
- **邮件配置** — 切换 SMTP/API，测试发送
- **审计日志** — 操作记录追踪
- **系统设置** — 平台名称等参数

### 外接 API / External API

All API requests require `Authorization: Bearer <API_KEY>` header.

所有 API 请求需在 Header 中携带 `Authorization: Bearer <API_KEY>`。

```bash
# 获取当前用户信息 / Get current user
curl https://yourdomain.com/api/v1/me \
  -H "Authorization: Bearer cf_xxxxxxxx"

# AI 聊天 / AI Chat
curl -X POST https://yourdomain.com/api/v1/ai/chat \
  -H "Authorization: Bearer cf_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","model":"@cf/meta/llama-3.1-8b-instruct"}'

# AI 嵌入 / AI Embeddings
curl -X POST https://yourdomain.com/api/v1/ai/embed \
  -H "Authorization: Bearer cf_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}'

# 列出我的域名 / List my domains
curl https://yourdomain.com/api/v1/domains \
  -H "Authorization: Bearer cf_xxxxxxxx"
```

### MCP 接入 / MCP Integration

Endpoint: `https://yourdomain.com/mcp`

Compatible with Claude Desktop, Cursor, and any JSON-RPC 2.0 MCP client.

**Claude Desktop config (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "cf-platform": {
      "url": "https://yourdomain.com/mcp",
      "headers": {
        "Authorization": "Bearer cf_xxxxxxxx"
      }
    }
  }
}
```

**Available MCP Tools:**
| Tool | Description |
|------|-------------|
| `ai_chat` | AI 对话 / AI chat |
| `ai_embed` | 文本嵌入 / Text embeddings |
| `list_domains` | 列出租户域名 / List tenant domains |

### 二级域名分发 / Subdomain Distribution

1. Register an account and login
2. In account dashboard, create a new subdomain
3. System auto-creates DNS record via Cloudflare API
4. Visit `https://subdomain.yourdomain.com` to see your subsite

（注册账号并登录 → 在账户面板创建子域名 → 系统自动创建 DNS 记录 → 访问子域名查看子站点。）

---

## 📝 NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | 本地开发服务器 / Start dev server |
| `npm run deploy` | 部署到 Cloudflare / Deploy to Cloudflare |
| `npm run typecheck` | 类型检查 / Type checking |
| `npm run db:migrate:local` | 本地数据库迁移 / Local DB migration |
| `npm run db:migrate:remote` | 远程数据库迁移 / Remote DB migration |

---

## 🔒 安全说明 / Security Notes

- Passwords hashed with bcrypt (cost factor 10)
- JWT tokens for session management
- API Keys stored as SHA-256 hashes (never plaintext)
- Rate limiting via KV
- Audit logging for admin actions
- Secrets stored as Cloudflare Worker Secrets (never in code)

---

## 📄 License

MIT

---

## 🙏 致谢 / Acknowledgments

- [Cloudflare](https://cloudflare.com) — Edge computing platform
- [Hono](https://hono.dev) — Web framework
- [Alpine.js](https://alpinejs.dev) — Lightweight JS framework
- [Tailwind CSS](https://tailwindcss.com) — Utility-first CSS

---

<p align="center">Made with ☁️ on Cloudflare Workers</p>
