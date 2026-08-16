// 认证路由：邮箱注册/登录/验证/重置 + GitHub OAuth

import { Hono } from 'hono';
import type { Env } from '../env';
import { getDB } from '../lib/db';
import { getAuth, getCookie, cookieOpts } from '../lib/auth';
import { buildEmailProvider } from '../lib/email';
import { isValidEmail, isValidSubdomain, code6, uuid, getClientIP } from '../lib/utils';
import { rateLimit } from '../middleware';

export const auth = new Hono<{ Bindings: Env }>();

// ─── 邮箱注册 ─────────────────────────────────────────────
auth.post(
  '/register',
  rateLimit({ key: (c) => getClientIP(c.req.raw), limit: 10, window: 60 }),
  async (c) => {
    const db = getDB(c.env);
    const allow = (await db.getSetting('allow_registration', 'true')) === 'true';
    if (!allow) return c.json({ error: '已关闭注册' }, 403);
    const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!isValidEmail(email)) return c.json({ error: '邮箱格式错误' }, 400);
    if (password.length < 8) return c.json({ error: '密码至少 8 位' }, 400);
    if (await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) {
      return c.json({ error: '该邮箱已注册' }, 409);
    }
    const authLib = getAuth(c.env, db);
    const user = await authLib.createUser({ email, password, name: body.name || '' });
    // 发送验证码
    await sendVerifyCode(c.env, db, email);
    return c.json({ ok: true, message: '注册成功，请查收验证邮件' });
  }
);

// ─── 发送验证码（注册验证 / 重置共用）──────────────────
async function sendVerifyCode(env: Env, db: ReturnType<typeof getDB>, email: string, purpose = 'verify') {
  const code = code6();
  const id = uuid();
  const expires = Date.now() + 15 * 60 * 1000;
  await db
    .prepare('INSERT INTO codes (id, email, purpose, code, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .bind(id, email, purpose, code, expires, Date.now())
    .run();
  const provider = await buildEmailProvider(env, db);
  const subject = purpose === 'verify' ? '【验证码】注册验证' : '【重置密码】验证码';
  const html = `<div style="font-family:sans-serif"><p>你的验证码是：</p><h2 style="letter-spacing:4px">${code}</h2><p>15 分钟内有效。</p></div>`;
  const r = await provider.send({ to: email, subject, html });
  return r;
}

// ─── 验证邮箱 ─────────────────────────────────────────────
auth.post('/verify', async (c) => {
  const db = getDB(c.env);
  const { email, code } = await c.req.json<{ email: string; code: string }>();
  const row = await db
    .prepare("SELECT * FROM codes WHERE email = ? AND purpose = 'verify' AND code = ? AND used = 0 AND expires_at > ?")
    .bind(email.toLowerCase(), code, Date.now())
    .first<{ id: string }>();
  if (!row) return c.json({ error: '验证码无效或已过期' }, 400);
  await db.prepare('UPDATE codes SET used = 1 WHERE id = ?').bind(row.id).run();
  await db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').bind(email.toLowerCase()).run();
  return c.json({ ok: true });
});

// ─── 邮箱登录 ─────────────────────────────────────────────
auth.post(
  '/login',
  rateLimit({ key: (c) => getClientIP(c.req.raw), limit: 15, window: 60 }),
  async (c) => {
    const db = getDB(c.env);
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    const authLib = getAuth(c.env, db);
    const user = await authLib.getUserByEmail(email);
    if (!user || !user.password_hash) return c.json({ error: '邮箱或密码错误' }, 401);
    if (user.status === 'banned') return c.json({ error: '账号已被封禁' }, 403);
    if (!authLib.verifyPassword(password, user.password_hash)) {
      return c.json({ error: '邮箱或密码错误' }, 401);
    }
    return await finishLogin(c, user);
  }
);

async function finishLogin(
  c: import('hono').Context<{ Bindings: Env }, string, object>,
  user: import('../env').UserRow
) {
  const db = getDB(c.env);
  const authLib = getAuth(c.env, db);
  const access = await authLib.signAccess(user);
  const refresh = await authLib.createSession(user, c.req.raw.headers.get('user-agent') || '', getClientIP(c.req.raw));
  const secure = c.req.raw.url.startsWith('https://');
  c.header('Set-Cookie', cookieOpts('access_token', access, 3600, secure));
  c.header('Set-Cookie', cookieOpts('refresh_token', refresh, 30 * 24 * 3600, secure));
  await db.audit({ user_id: user.id, action: 'login', ip: getClientIP(c.req.raw) });
  return c.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}

// ─── 登出 ─────────────────────────────────────────────────
auth.post('/logout', async (c) => {
  const db = getDB(c.env);
  const refresh = getCookie(c.req.raw, 'refresh_token');
  if (refresh) {
    const authLib = getAuth(c.env, db);
    await authLib.destroySession(refresh);
  }
  const secure = c.req.raw.url.startsWith('https://');
  c.header('Set-Cookie', cookieOpts('access_token', '', 0, secure));
  c.header('Set-Cookie', cookieOpts('refresh_token', '', 0, secure));
  return c.json({ ok: true });
});

// ─── 忘记密码 / 重置 ─────────────────────────────────────
auth.post('/forgot', rateLimit({ key: (c) => getClientIP(c.req.raw), limit: 5, window: 60 }), async (c) => {
  const db = getDB(c.env);
  const { email } = await c.req.json<{ email: string }>();
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  // 即便不存在也返回成功，避免枚举
  if (user) await sendVerifyCode(c.env, db, email.toLowerCase(), 'reset');
  return c.json({ ok: true, message: '若邮箱存在，验证码已发送' });
});

auth.post('/reset', async (c) => {
  const db = getDB(c.env);
  const { email, code, password } = await c.req.json<{ email: string; code: string; password: string }>();
  if (password.length < 8) return c.json({ error: '密码至少 8 位' }, 400);
  const row = await db
    .prepare("SELECT * FROM codes WHERE email = ? AND purpose = 'reset' AND code = ? AND used = 0 AND expires_at > ?")
    .bind(email.toLowerCase(), code, Date.now())
    .first<{ id: string }>();
  if (!row) return c.json({ error: '验证码无效或已过期' }, 400);
  await db.prepare('UPDATE codes SET used = 1 WHERE id = ?').bind(row.id).run();
  const authLib = getAuth(c.env, db);
  await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?')
    .bind(authLib.hashPassword(password), Date.now(), email.toLowerCase())
    .run();
  return c.json({ ok: true });
});

// ─── GitHub OAuth ────────────────────────────────────────
auth.get('/github', (c) => {
  const state = uuid();
  const redirect = encodeURIComponent(c.env.BASE_DOMAIN ? `https://${c.env.BASE_DOMAIN}/auth/github/callback` : 'https://yourdomain.com/auth/github/callback');
  const url =
    `https://github.com/login/oauth/authorize?client_id=${c.env.GITHUB_CLIENT_ID}` +
    `&redirect_uri=${redirect}&scope=read:user user:email&state=${state}`;
  c.header('Set-Cookie', `oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax`);
  return c.redirect(url);
});

auth.get('/github/callback', async (c) => {
  const db = getDB(c.env);
  const code = c.req.query('code');
  const state = c.req.query('state');
  const savedState = getCookie(c.req.raw, 'oauth_state');
  if (!code || !state || state !== savedState) return c.redirect('/login?error=oauth');
  // 换 token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) return c.redirect('/login?error=oauth');
  const gh = tokenData.access_token;
  // 取用户资料
  const uRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${gh}`, 'User-Agent': 'cf-platform' },
  });
  const u = (await uRes.json()) as { id: number; login: string; name?: string; avatar_url: string; email?: string | null };
  let email = u.email;
  if (!email) {
    const eRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${gh}`, 'User-Agent': 'cf-platform' },
    });
    const emails = (await eRes.json()) as { email: string; primary: boolean; verified: boolean }[];
    email = emails.find((e) => e.primary && e.verified)?.email || emails[0]?.email;
  }
  if (!email) return c.redirect('/login?error=noemail');
  const authLib = getAuth(c.env, db);
  const user = await authLib.upsertGithubUser({
    github_id: u.id,
    email,
    name: u.name || u.login,
    avatar_url: u.avatar_url,
  });
  const access = await authLib.signAccess(user);
  const refresh = await authLib.createSession(user, c.req.raw.headers.get('user-agent') || '', getClientIP(c.req.raw));
  const secure = c.req.raw.url.startsWith('https://');
  c.header('Set-Cookie', cookieOpts('access_token', access, 3600, secure));
  c.header('Set-Cookie', cookieOpts('refresh_token', refresh, 30 * 24 * 3600, secure));
  c.header('Set-Cookie', `oauth_state=; Max-Age=0; Path=/; HttpOnly`);
  await db.audit({ user_id: user.id, action: 'login_github', ip: getClientIP(c.req.raw) });
  return c.redirect('/admin');
});

// ─── 当前用户信息（前端用）──────────────────────────────
auth.get('/me', async (c) => {
  const db = getDB(c.env);
  const authLib = getAuth(c.env, db);
  const token = getCookie(c.req.raw, 'access_token');
  if (!token) return c.json({ user: null });
  const claims = await authLib.verifyAccess(token);
  if (!claims) return c.json({ user: null });
  const user = await authLib.getUserById(claims.sub);
  if (!user || user.status !== 'active') return c.json({ user: null });
  return c.json({ user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role } });
});

// 占位：防止 isValidSubdomain 被摇树删除（供其他模块复用）
export const _validate = { isValidSubdomain };
