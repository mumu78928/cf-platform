// 外接 API：REST，API Key 鉴权，前缀 /api/v1

import { Hono } from 'hono';
import type { Env } from '../env';
import { getDB } from '../lib/db';
import { getAI } from '../lib/ai';
import { apiKeyAuth } from '../middleware';
import { isValidSubdomain, uuid } from '../lib/utils';

export const api = new Hono<{ Bindings: Env }>();

api.use('*', apiKeyAuth);

// 当前 key 所属用户
api.get('/me', async (c) => {
  const user = c.var.apiKeyUser!;
  await getDB(c.env).logUsage(user.id, '/api/v1/me');
  return c.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, key: { name: c.var.apiKey!.name, scopes: JSON.parse(c.var.apiKey!.scopes) } });
});

// AI 聊天（非流式）
api.post('/ai/chat', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/api/v1/ai/chat');
  const body = await c.req.json<{ message?: string; system?: string; messages?: { role: string; content: string }[]; model?: string }>();
  const ai = getAI(c.env, db);
  let messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  if (body.messages) {
    messages = body.messages as typeof messages;
  } else {
    messages = [];
    if (body.system) messages.push({ role: 'system', content: body.system });
    messages.push({ role: 'user', content: body.message || '' });
  }
  const reply = await ai.chat(messages, body.model);
  return c.json({ reply, model: await ai.model() });
});

// AI 流式聊天（SSE）
api.post('/ai/chat/stream', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/api/v1/ai/chat/stream');
  const body = await c.req.json<{ message?: string; system?: string; messages?: { role: string; content: string }[]; model?: string }>();
  const ai = getAI(c.env, db);
  let messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  if (body.messages) {
    messages = body.messages as typeof messages;
  } else {
    messages = [];
    if (body.system) messages.push({ role: 'system', content: body.system });
    messages.push({ role: 'user', content: body.message || '' });
  }
  const stream = await ai.chatStream(messages, body.model);
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
});

// AI 嵌入
api.post('/ai/embed', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/api/v1/ai/embed');
  const { text } = await c.req.json<{ text: string }>();
  const ai = getAI(c.env, db);
  const embedding = await ai.embed(text);
  return c.json({ embedding });
});

// 域名列表
api.get('/domains', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/api/v1/domains');
  const rows = await db.prepare('SELECT id, subdomain, status, title, description, created_at FROM domains WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return c.json({ domains: rows.results });
});

// 创建域名
api.post('/domains', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/api/v1/domains:create');
  const { subdomain, title, description, content } = await c.req.json<{ subdomain: string; title?: string; description?: string; content?: string }>();
  const sub = (subdomain || '').toLowerCase();
  if (!isValidSubdomain(sub)) return c.json({ error: '子域名格式无效' }, 400);
  if (await db.prepare('SELECT id FROM domains WHERE subdomain = ?').bind(sub).first()) {
    return c.json({ error: '子域名已被占用' }, 409);
  }
  const did = uuid();
  const ts = Date.now();
  await db.prepare(
    'INSERT INTO domains (id, user_id, subdomain, status, title, description, is_custom, custom_host, dns_record_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
  ).bind(did, user.id, sub, 'active', title || '', description || '', '', '', ts, ts).run();
  await db.prepare('INSERT INTO pages (id, domain_id, content, theme, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), did, content || `# ${title || sub}`, 'default', ts).run();
  await db.audit({ user_id: user.id, action: 'domain_create', details: sub, ip: '' });
  return c.json({ ok: true, domain: { id: did, subdomain: sub, url: `https://${sub}.${c.env.BASE_DOMAIN}` } });
});

// 更新页面
api.put('/domains/:sub/page', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/api/v1/domains/page:update');
  const sub = c.req.param('sub');
  const dom = await db.prepare('SELECT id FROM domains WHERE user_id = ? AND subdomain = ?').bind(user.id, sub).first<{ id: string }>();
  if (!dom) return c.json({ error: '站点不存在' }, 404);
  const { content, title } = await c.req.json<{ content: string; title?: string }>();
  await db.prepare('UPDATE pages SET content = ?, updated_at = ? WHERE domain_id = ?').bind(content, Date.now(), dom.id).run();
  if (title) await db.prepare('UPDATE domains SET title = ?, updated_at = ? WHERE id = ?').bind(title, Date.now(), dom.id).run();
  return c.json({ ok: true });
});
