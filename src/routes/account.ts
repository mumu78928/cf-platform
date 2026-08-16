// 账户路由：登录用户管理自己的域名、页面、API Key（前缀 /account）

import { Hono } from 'hono';
import type { Env } from '../env';
import { getDB } from '../lib/db';
import { requireAuth } from '../middleware';
import { isValidSubdomain, generateApiKey, sha256, uuid, getClientIP } from '../lib/utils';

export const account = new Hono<{ Bindings: Env }>();
account.use('*', requireAuth);

// ─── 个人资料 ─────────────────────────────────────────────
account.get('/profile', (c) => {
  const u = c.var.user!;
  return c.json({ id: u.id, email: u.email, name: u.name, avatar_url: u.avatar_url, role: u.role, email_verified: !!u.email_verified, created_at: u.created_at });
});

account.put('/profile', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const db = getDB(c.env);
  await db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').bind(name, Date.now(), c.var.user!.id).run();
  return c.json({ ok: true });
});

// ─── 我的域名 ─────────────────────────────────────────────
account.get('/domains', async (c) => {
  const db = getDB(c.env);
  const rows = await db.prepare(
    `SELECT d.id, d.subdomain, d.status, d.title, d.description, d.created_at, d.updated_at,
            (SELECT content FROM pages WHERE domain_id = d.id LIMIT 1) as content
     FROM domains d WHERE d.user_id = ? ORDER BY d.created_at DESC`
  ).bind(c.var.user!.id).all();
  return c.json({ domains: rows.results });
});

account.post('/domains', async (c) => {
  const db = getDB(c.env);
  const { subdomain, title, description, content } = await c.req.json<{ subdomain: string; title?: string; description?: string; content?: string }>();
  const sub = (subdomain || '').toLowerCase();
  if (!isValidSubdomain(sub)) return c.json({ error: '子域名格式无效（3-32位，字母开头，仅小写字母数字-）' }, 400);
  if (await db.prepare('SELECT id FROM domains WHERE subdomain = ?').bind(sub).first()) {
    return c.json({ error: '该子域名已被占用' }, 409);
  }
  const did = uuid();
  const ts = Date.now();
  await db.prepare(
    'INSERT INTO domains (id, user_id, subdomain, status, title, description, is_custom, custom_host, dns_record_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
  ).bind(did, c.var.user!.id, sub, 'active', title || '', description || '', '', '', ts, ts).run();
  await db.prepare('INSERT INTO pages (id, domain_id, content, theme, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), did, content || `# ${title || sub}\n\n欢迎来到 ${sub} 的主页`, 'default', ts).run();
  await db.audit({ user_id: c.var.user!.id, action: 'domain_create', details: sub, ip: getClientIP(c.req.raw) });
  return c.json({ ok: true, domain: { id: did, subdomain: sub, url: `https://${sub}.${c.env.BASE_DOMAIN}` } });
});

account.put('/domains/:sub', async (c) => {
  const db = getDB(c.env);
  const sub = c.req.param('sub');
  const dom = await db.prepare('SELECT id FROM domains WHERE user_id = ? AND subdomain = ?').bind(c.var.user!.id, sub).first<{ id: string }>();
  if (!dom) return c.json({ error: '站点不存在' }, 404);
  const { title, description, content } = await c.req.json<{ title?: string; description?: string; content?: string }>();
  if (title !== undefined || description !== undefined) {
    await db.prepare('UPDATE domains SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ?')
      .bind(title ?? null, description ?? null, Date.now(), dom.id).run();
  }
  if (content !== undefined) {
    await db.prepare('UPDATE pages SET content = ?, updated_at = ? WHERE domain_id = ?').bind(content, Date.now(), dom.id).run();
  }
  return c.json({ ok: true });
});

account.delete('/domains/:sub', async (c) => {
  const db = getDB(c.env);
  const sub = c.req.param('sub');
  const dom = await db.prepare('SELECT id FROM domains WHERE user_id = ? AND subdomain = ?').bind(c.var.user!.id, sub).first<{ id: string }>();
  if (!dom) return c.json({ error: '站点不存在' }, 404);
  await db.prepare('DELETE FROM domains WHERE id = ?').bind(dom.id).run();
  await db.audit({ user_id: c.var.user!.id, action: 'domain_delete', details: sub, ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

// ─── API Key 管理 ─────────────────────────────────────────
account.get('/api-keys', async (c) => {
  const db = getDB(c.env);
  const rows = await db.prepare('SELECT id, name, key_prefix, scopes, last_used_at, expires_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').bind(c.var.user!.id).all();
  return c.json({ keys: rows.results });
});

account.post('/api-keys', async (c) => {
  const db = getDB(c.env);
  const { name, scopes } = await c.req.json<{ name: string; scopes?: string[] }>();
  const raw = generateApiKey();
  const hash = await sha256(raw);
  const id = uuid();
  await db.prepare('INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.var.user!.id, name || 'default', raw.slice(0, 12), hash, JSON.stringify(scopes || []), Date.now()).run();
  await db.audit({ user_id: c.var.user!.id, action: 'apikey_create', details: name || '', ip: getClientIP(c.req.raw) });
  // 仅此一次返回明文
  return c.json({ ok: true, key: raw, id });
});

account.delete('/api-keys/:id', async (c) => {
  const db = getDB(c.env);
  await db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.var.user!.id).run();
  return c.json({ ok: true });
});
