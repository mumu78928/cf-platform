// 中间件集合：auth、requireAuth、requireAdmin、tenant、apiKeyAuth、rateLimit

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { Env, UserRow, DomainRow, ApiKeyRow } from '../env';
import { getDB } from '../lib/db';
import { getAuth, getCookie } from '../lib/auth';
import { sha256, getClientIP } from '../lib/utils';

/** 解析当前用户（不强求登录），注入 c.var.user */
export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const db = getDB(c.env);
  const auth = getAuth(c.env, db);
  const token = getCookie(c.req.raw, 'access_token');
  if (token) {
    const claims = await auth.verifyAccess(token);
    if (claims) {
      const user = await auth.getUserById(claims.sub);
      if (user && user.status === 'active') {
        c.set('user', user);
      }
    }
  }
  // access token 过期 → 尝试用 refresh 续期
  if (!c.var.user) {
    const refresh = getCookie(c.req.raw, 'refresh_token');
    if (refresh) {
      const user = await auth.verifySession(refresh);
      if (user) {
        const newAccess = await auth.signAccess(user);
        const secure = c.req.url.startsWith('https://');
        c.header('Set-Cookie', `access_token=${newAccess}; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
        c.set('user', user);
      }
    }
  }
  await next();
});

/** 要求登录 */
export const requireAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!c.var.user) return c.json({ error: '未登录' }, 401);
  await next();
});

/** 要求管理员 */
export const requireAdmin = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!c.var.user) return c.json({ error: '未登录' }, 401);
  if (c.var.user.role !== 'admin') return c.json({ error: '需要管理员权限' }, 403);
  await next();
});

/** 子域名解析：根据 Host 判断是否为租户站点，注入 c.var.tenant */
export const tenantMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const host = (c.req.header('host') || '').split(':')[0].toLowerCase();
  const base = (c.env.BASE_DOMAIN || '').toLowerCase();
  if (base && host.endsWith('.' + base)) {
    const sub = host.slice(0, -('.' + base).length);
    // 排除 www / api / admin 等保留前缀
    if (sub && !['www', 'api', 'admin', 'mcp'].includes(sub)) {
      const db = getDB(c.env);
      const domain = await db
        .prepare("SELECT * FROM domains WHERE subdomain = ? AND status = 'active'")
        .bind(sub)
        .first<DomainRow>();
      c.set('tenant', domain ?? null);
    }
  } else if (host) {
    // 自定义域名匹配
    const db = getDB(c.env);
    const domain = await db
      .prepare("SELECT * FROM domains WHERE custom_host = ? AND status = 'active'")
      .bind(host)
      .first<DomainRow>();
    if (domain) c.set('tenant', domain);
  }
  await next();
});

/** API Key 鉴权（外部 API / MCP）：Authorization: Bearer <key> */
export const apiKeyAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authz = c.req.header('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return c.json({ error: '缺少 API Key' }, 401);
  const key = m[1].trim();
  const hash = await sha256(key);
  const db = getDB(c.env);
  const row = await db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').bind(hash).first<ApiKeyRow>();
  if (!row) return c.json({ error: 'API Key 无效' }, 401);
  if (row.expires_at && row.expires_at < Date.now()) return c.json({ error: 'API Key 已过期' }, 401);
  const user = await db.prepare('SELECT * FROM users WHERE id = ? AND status = ?').bind(row.user_id, 'active').first<UserRow>();
  if (!user) return c.json({ error: '用户不可用' }, 401);
  // 更新 last_used
  await db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(Date.now(), row.id).run();
  c.set('apiKey', row);
  c.set('apiKeyUser', user);
  await next();
});

/**
 * KV 限流：按 key（如 IP/user）每分钟 N 次
 * 用法：rateLimit({ key: (c) => ip, limit: 60, window: 60 })
 */
export function rateLimit(opts: {
  key: (c: Context<{ Bindings: Env }>) => string;
  limit: number;
  window: number; // 秒
}) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const k = 'rl:' + opts.key(c);
    const raw = await c.env.KV.get(k);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= opts.limit) {
      return c.json({ error: '请求过于频繁，请稍后再试' }, 429);
    }
    await c.env.KV.put(k, String(count + 1), { expirationTtl: opts.window });
    await next();
  });
}

/** 从 c 中安全取 user（带类型） */
export function currentUser(c: { var: { user: UserRow | null } }): UserRow | null {
  return c.var.user;
}

export { getClientIP };
