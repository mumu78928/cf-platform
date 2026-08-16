// cf-platform 主入口
// 单 Worker 承载：公共页面、认证、账户、管理后台 API、外接 API、MCP、租户站点

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { jsxRenderer } from 'hono/jsx-renderer';
import type { Env } from './env';
import { getDB } from './lib/db';
import { authMiddleware, tenantMiddleware } from './middleware';
import { auth } from './routes/auth';
import { api } from './routes/api';
import { mcp } from './routes/mcp';
import { account } from './routes/account';
import { admin } from './routes/admin';
import { pages, landingPage, tenantPage, notFoundPage } from './routes/pages';
import { adminShell } from './ui/admin';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', jsxRenderer());
app.use('*', tenantMiddleware);
app.use('*', authMiddleware);

// ─── API 路由组（前缀挂载）─────────────────────────────
app.route('/auth', auth);
app.route('/api/v1', api);
app.route('/mcp', mcp);
app.route('/account', account);
app.route('/admin/api', admin);

// ─── 公共页面（/login、/register、/forgot 等子路径）────────
app.route('/', pages); // 注意：pages 不再注册 GET '/'，根路径由下方显式处理

// ─── 管理后台 SPA（GET /admin 与 /admin/*）────────────
app.get('/admin', (c) => {
  const user = c.var.user;
  if (!user) return c.redirect('/login');
  return c.html(adminShell({ user, platformName: c.env.PLATFORM_NAME || 'CF Platform', baseDomain: c.env.BASE_DOMAIN || new URL(c.req.url).hostname }));
});
app.get('/admin/*', (c) => {
  const user = c.var.user;
  if (!user) return c.redirect('/login');
  return c.html(adminShell({ user, platformName: c.env.PLATFORM_NAME || 'CF Platform', baseDomain: c.env.BASE_DOMAIN || new URL(c.req.url).hostname }));
});

// ─── 根路径：子域名 → 租户页；主域名 → 落地页 ─────────────
app.get('/', async (c) => {
  const tenant = c.var.tenant;
  if (tenant) {
    const db = getDB(c.env);
    const page = await db.prepare('SELECT content FROM pages WHERE domain_id = ? LIMIT 1').bind(tenant.id).first<{ content: string }>();
    return c.html(
      tenantPage({
        title: tenant.title || tenant.subdomain,
        content: page?.content || '',
        description: tenant.description,
        subdomain: tenant.subdomain,
        baseDomain: c.env.BASE_DOMAIN,
        platformName: c.env.PLATFORM_NAME || 'CF Platform',
      })
    );
  }
  return c.render(landingPage(c.env));
});

// ─── 404 ──────────────────────────────────────────────
app.notFound((c) => {
  // 子域名下的 404 也用租户风格
  if (c.var.tenant) return c.html(notFoundPage());
  return c.text('Not Found', 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: '服务器内部错误', detail: (err as Error).message }, 500);
});

export default app;
