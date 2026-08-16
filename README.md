# yumingfenfa（域名分发）— 二级域名分发系统

> 基于 Cloudflare Workers 的二级域名分发平台。用户注册后自动获得 `username.yourdomain.com` 子站点，管理员可通过后台管理所有用户和域名。

---

## 功能

| 功能 | 说明 |
|------|------|
| **二级域名分发** | 用户注册后自动分配子域名，系统自动创建 DNS 记录 |
| **管理后台** | 仪表盘、用户管理、域名管理、API Key、邮件配置、审计日志、系统设置 |
| **注册登录** | 邮箱密码注册 + GitHub OAuth 登录（首个用户自动成为管理员） |
| **GitHub Actions 自动部署** | 推送 main 分支即自动部署，无需手动操作 Cloudflare |
| **外接 API** | `/api/v1/*`，API Key 鉴权，支持 AI 聊天和文本嵌入 |
| **MCP 接入** | JSON-RPC 2.0 接口，兼容 Claude Desktop、Cursor 等 MCP 客户端 |
| **邮件双模式** | 支持 SMTP 或 HTTP API，管理后台可在线切换 |

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Cloudflare Workers |
| 框架 | Hono |
| 数据库 | Cloudflare D1 (SQLite) |
| 缓存 | Cloudflare KV |
| 存储 | Cloudflare R2 |
| AI | Cloudflare Workers AI |
| 认证 | JWT + bcrypt |
| 前端 | Hono JSX + Alpine.js + Tailwind CSS |
| 部署 | GitHub Actions + Wrangler |

## 项目结构

```
yumingfenfa/
├── .github/workflows/deploy.yml   # 自动部署（密钥在此填写）
├── migrations/0001_init.sql       # 数据库表结构
├── scripts/setup.mjs              # 一键初始化 Cloudflare 资源
├── src/
│   ├── index.tsx                  # 主入口
│   ├── env.ts                     # 环境变量类型定义
│   ├── lib/
│   │   ├── auth.ts                # JWT + bcrypt 认证
│   │   ├── db.ts                  # D1 数据库操作
│   │   ├── dns.ts                 # Cloudflare DNS API
│   │   ├── email.ts               # 邮件发送
│   │   ├── mcp.ts                 # MCP JSON-RPC Server
│   │   ├── ai.ts                  # Workers AI 封装
│   │   └── utils.ts               # 工具函数
│   ├── middleware/index.ts        # 中间件（验证/限流等）
│   ├── routes/
│   │   ├── auth.ts                # 注册/登录/GitHub OAuth
│   │   ├── account.ts             # 用户账户管理
│   │   ├── admin.ts               # 管理后台 API
│   │   ├── api.ts                 # 外接 API
│   │   ├── mcp.ts                 # MCP 端点
│   │   └── pages.tsx              # 前端页面路由
│   └── ui/
│       ├── admin.tsx              # 管理后台 SPA
│       └── layout.tsx             # 页面布局
├── public/robots.txt
├── .dev.vars.example
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## 部署步骤

### 1. 前置条件

- Node.js 20+
- Cloudflare 账户（免费套餐即可）
- GitHub 账户
- 一个域名（已托管在 Cloudflare）

### 2. 克隆项目

```bash
git clone https://github.com/mumu78928/cf-platform.git
cd cf-platform
```

### 3. 配置 DNS 通配记录

在 Cloudflare Dashboard → 你的域名 → DNS 中添加一条 A 记录：

| 类型 | 名称 | 内容 | 代理 |
|------|------|------|------|
| A | `*` | `192.0.2.1` | 已代理（橙色云朵） |

### 4. 创建 GitHub OAuth App

1. 访问 https://github.com/settings/developers → New OAuth App
2. 填写：
   - Application name: `yumingfenfa`（或任意名称）
   - Homepage URL: `https://你的域名.com`
   - Authorization callback URL: `https://你的域名.com/auth/github/callback`
3. 创建后复制 **Client ID** 和 **Client Secret**

### 5. 编辑 deploy.yml 填写密钥

打开 `.github/workflows/deploy.yml`，将文件顶部所有 `********` 替换为真实值：

| 密钥 | 获取方式 |
|------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens，模板选 "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard 右侧边栏 → Account ID |
| `CF_ZONE_ID` | Cloudflare Dashboard → 你的域名 → 右侧边栏 → Zone ID |
| `JWT_SECRET` | 任意长随机字符串，可用 `openssl rand -hex 32` 生成 |
| `GITHUB_CLIENT_ID` | 上一步创建的 GitHub OAuth App 页面 |
| `GITHUB_CLIENT_SECRET` | 上一步创建的 GitHub OAuth App 页面 → Generate a new client secret |
| `CF_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token，权限：Zone → DNS → Edit |
| `BASE_DOMAIN` | 你的主域名，如 `example.com`（不要带 https://） |

> D1 数据库、KV 命名空间、R2 存储桶会在部署时**自动创建**，无需手动操作。

### 6. 提交部署

修改完成后提交到 main 分支，GitHub Actions 会自动执行：
1. 自动创建 D1 数据库、KV 命名空间、R2 存储桶
2. 应用 D1 数据库迁移（创建表结构）
3. 部署 Worker
4. 写入加密变量

## 使用说明

### 管理后台

访问 `https://你的域名.com/admin`，**第一个注册的用户自动成为管理员**（通过 GitHub 登录或邮箱注册均可）。

功能模块：
- **仪表盘** — 用户数、域名数、API 调用统计
- **用户管理** — 查看/封禁/解封用户，修改角色
- **域名管理** — 查看/暂停/删除子域名，DNS 记录状态
- **API Key** — 创建/撤销 API Key，设置权限
- **邮件配置** — 切换 SMTP/API 模式，测试发送
- **审计日志** — 操作记录追踪
- **系统设置** — 平台名称等参数

### 二级域名分发

1. 注册账号并登录
2. 在账户面板创建子域名（如 `myblog`）
3. 系统自动通过 Cloudflare API 创建 DNS 记录
4. 访问 `https://myblog.你的域名.com` 即可查看子站点
5. 子站点内容支持 Markdown 编辑

### 外接 API

所有 API 请求需在 Header 中携带 `Authorization: Bearer <API_KEY>`。

```bash
# 获取当前用户信息
curl https://你的域名.com/api/v1/me -H "Authorization: Bearer cf_xxxxxxxx"

# AI 聊天
curl -X POST https://你的域名.com/api/v1/ai/chat \
  -H "Authorization: Bearer cf_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'

# 列出我的域名
curl https://你的域名.com/api/v1/domains -H "Authorization: Bearer cf_xxxxxxxx"
```

### MCP 接入

端点：`https://你的域名.com/mcp`，兼容 Claude Desktop、Cursor 等 MCP 客户端。

Claude Desktop 配置（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "yumingfenfa": {
      "url": "https://你的域名.com/mcp",
      "headers": { "Authorization": "Bearer cf_xxxxxxxx" }
    }
  }
}
```

可用 MCP 工具：`ai_chat`（AI 对话）、`domain_create`（创建子域名）、`domain_list`（列出域名）、`domain_page_update`（更新子站点内容）、`user_info`（用户信息）、`api_stats`（调用统计）

### 二级域名架构

```
你的域名.com
  ├── /              → 落地页
  ├── /login         → 登录页
  ├── /register      → 注册页
  ├── /admin         → 管理后台
  ├── /auth/*        → 认证接口
  ├── /account/*     → 账户管理
  ├── /admin/api/*   → 管理后台 API
  ├── /api/v1/*      → 外接 API（API Key 鉴权）
  └── /mcp           → MCP JSON-RPC 端点

*.你的域名.com
  └── /              → 用户子站点（Markdown 内容）
```

## NPM 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发 |
| `npm run deploy` | 手动部署到 Cloudflare |
| `npm run typecheck` | 类型检查 |
| `npm run db:migrate:local` | 本地数据库迁移 |
| `npm run db:migrate:remote` | 远程数据库迁移 |

## 安全说明

- 密码使用 bcrypt 哈希存储
- 登录会话使用 JWT 管理
- API Key 存储为 SHA-256 哈希，不存明文
- 通过 KV 实现接口限流
- 管理操作记录审计日志
- 所有密钥通过 Cloudflare Worker Secrets 存储，不写入代码