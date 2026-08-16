// 管理后台 API（前缀 /admin/api，仅管理员）

import { Hono } from 'hono';
import type { Env } from '../env';
import { getDB } from '../lib/db';
import { buildEmailProvider, getEmailProvider, type EmailConfig } from '../lib/email';
import { requireAdmin } from '../middleware';
import { uuid, getClientIP } from '../lib/utils';

export const admin = new Hono<{ Bindings: Env }>();
admin.use('*', requireAdmin);

// ─── 仪表盘统计 ───────────────────────────────────────────
admin.get('/stats', async (c) => {
  const db = getDB(c.env);
  const [users, domains, apikeys, calls7d] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM domains').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM api_keys').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM api_usage WHERE created_at > ?').bind(Date.now() - 7 * 86400000).first<{ c: number }>(),
  ]);
  // 最近 14 天调用趋势
  const trend = await db.prepare(
    `SELECT date(created_at/1000, 'unixepoch') as day, COUNT(*) as count
     FROM api_usage WHERE created_at > ?
     GROUP BY day ORDER BY day ASC`
  ).bind(Date.now() - 14 * 86400000).all();
  const recentLogs = await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 20').all();
  return c.json({
    users: users?.c ?? 0,
    domains: domains?.c ?? 0,
    api_keys: apikeys?.c ?? 0,
    calls_7d: calls7d?.c ?? 0,
    trend: trend.results,
    recent_logs: recentLogs.results,
  });
});

// ─── 用户管理 ─────────────────────────────────────────────
admin.get('/users', async (c) => {
  const db = getDB(c.env);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const size = Math.min(100, Math.max(1, parseInt(c.req.query('size') || '20', 10)));
  const q = c.req.query('q') || '';
  const offset = (page - 1) * size;
  const where = q ? 'WHERE email LIKE ? OR name LIKE ?' : '';
  const binds = q ? [`%${q}%`, `%${q}%`] : [];
  const rows = await db.prepare(`SELECT id, email, name, avatar_url, role, status, email_verified, github_id, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, size, offset).all();
  const total = await db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).bind(...binds).first<{ c: number }>();
  return c.json({ users: rows.results, total: total?.c ?? 0, page, size });
});

admin.put('/users/:id', async (c) => {
  const db = getDB(c.env);
  const { role, status } = await c.req.json<{ role?: 'user' | 'admin'; status?: 'active' | 'banned' }>();
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (role) { sets.push('role = ?'); binds.push(role); }
  if (status) { sets.push('status = ?'); binds.push(status); }
  if (!sets.length) return c.json({ error: '无更新字段' }, 400);
  sets.push('updated_at = ?'); binds.push(Date.now()); binds.push(c.req.param('id'));
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await db.audit({ user_id: c.var.user!.id, action: 'user_update', details: c.req.param('id'), ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

admin.delete('/users/:id', async (c) => {
  const db = getDB(c.env);
  const id = c.req.param('id');
  if (id === c.var.user!.id) return c.json({ error: '不能删除自己' }, 400);
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await db.audit({ user_id: c.var.user!.id, action: 'user_delete', details: id, ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

// ─── 全部域名 ─────────────────────────────────────────────
admin.get('/domains', async (c) => {
  const db = getDB(c.env);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const size = Math.min(100, Math.max(1, parseInt(c.req.query('size') || '20', 10)));
  const offset = (page - 1) * size;
  const rows = await db.prepare(
    `SELECT d.*, u.email as owner_email FROM domains d LEFT JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
  ).bind(size, offset).all();
  const total = await db.prepare('SELECT COUNT(*) as c FROM domains').first<{ c: number }>();
  return c.json({ domains: rows.results, total: total?.c ?? 0, page, size });
});

admin.put('/domains/:id', async (c) => {
  const db = getDB(c.env);
  const { status, title, description } = await c.req.json<{ status?: string; title?: string; description?: string }>();
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (status) { sets.push('status = ?'); binds.push(status); }
  if (title !== undefined) { sets.push('title = ?'); binds.push(title); }
  if (description !== undefined) { sets.push('description = ?'); binds.push(description); }
  if (!sets.length) return c.json({ error: '无更新字段' }, 400);
  sets.push('updated_at = ?'); binds.push(Date.now()); binds.push(c.req.param('id'));
  await db.prepare(`UPDATE domains SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await db.audit({ user_id: c.var.user!.id, action: 'domain_update', details: c.req.param('id'), ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

admin.delete('/domains/:id', async (c) => {
  const db = getDB(c.env);
  await db.prepare('DELETE FROM domains WHERE id = ?').bind(c.req.param('id')).run();
  await db.audit({ user_id: c.var.user!.id, action: 'domain_delete', details: c.req.param('id'), ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

// ─── 设置 ─────────────────────────────────────────────────
admin.get('/settings', async (c) => {
  const db = getDB(c.env);
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, unknown> = {};
  for (const r of rows.results as { key: string; value: string }[]) {
    try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
  }
  return c.json({ settings });
});

admin.put('/settings', async (c) => {
  const db = getDB(c.env);
  const body = await c.req.json<Record<string, unknown>>();
  for (const [k, v] of Object.entries(body)) {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    await db.setSetting(k, val);
  }
  await db.audit({ user_id: c.var.user!.id, action: 'settings_update', details: Object.keys(body).join(','), ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

// ─── 邮件配置 ─────────────────────────────────────────────
admin.get('/email/config', async (c) => {
  const db = getDB(c.env);
  const provider = await db.getSetting('email_provider', 'none');
  const from = await db.getSetting('email_from', '');
  const config = await db.getSettingJSON<Partial<EmailConfig>>('email_config', {});
  // 脱敏：不返回完整密钥
  const masked: Partial<EmailConfig> = { ...config };
  if (masked.api_key) masked.api_key = mask(masked.api_key);
  if (masked.smtp_pass) masked.smtp_pass = mask(masked.smtp_pass);
  return c.json({ provider, from, config: masked });
});

admin.put('/email/config', async (c) => {
  const db = getDB(c.env);
  const { provider, from, config } = await c.req.json<{ provider: string; from: string; config: Partial<EmailConfig> }>();
  // 若传入脱敏占位则保留原值
  const existing = await db.getSettingJSON<Partial<EmailConfig>>('email_config', {});
  const merged: Partial<EmailConfig> = { ...existing, ...config };
  if (config.api_key && config.api_key.includes('•')) merged.api_key = existing.api_key;
  if (config.smtp_pass && config.smtp_pass.includes('•')) merged.smtp_pass = existing.smtp_pass;
  await db.setSetting('email_provider', provider);
  await db.setSetting('email_from', from);
  await db.setSettingJSON('email_config', merged);
  await db.audit({ user_id: c.var.user!.id, action: 'email_config_update', ip: getClientIP(c.req.raw) });
  return c.json({ ok: true });
});

// 测试发送
admin.post('/email/test', async (c) => {
  const db = getDB(c.env);
  const { to } = await c.req.json<{ to: string }>();
  const provider = await buildEmailProvider(c.env, db);
  const r = await provider.send({ to, subject: '【测试】cf-platform 邮件测试', html: '<p>这是一封来自 cf-platform 的测试邮件。</p>' });
  return c.json(r);
});

// ─── 审计日志 ─────────────────────────────────────────────
admin.get('/logs', async (c) => {
  const db = getDB(c.env);
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const size = Math.min(200, Math.max(1, parseInt(c.req.query('size') || '50', 10)));
  const offset = (page - 1) * size;
  const rows = await db.prepare('SELECT l.*, u.email FROM audit_logs l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.id DESC LIMIT ? OFFSET ?').bind(size, offset).all();
  const total = await db.prepare('SELECT COUNT(*) as c FROM audit_logs').first<{ c: number }>();
  return c.json({ logs: rows.results, total: total?.c ?? 0, page, size });
});

function mask(s: string): string {
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return s.slice(0, 2) + '•'.repeat(Math.min(8, s.length - 4)) + s.slice(-2);
}

// 占位导出，防止 getEmailProvider 被摇树
export const _provider = getEmailProvider;
