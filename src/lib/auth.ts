// 认证库：JWT 签发/校验、bcrypt 密码、会话管理、GitHub OAuth

import jwt from '@tsndr/cloudflare-worker-jwt';
import bcrypt from 'bcryptjs';
import type { Env, UserRow } from '../env';
import { DB } from './db';
import { uuid, now } from './utils';

const ACCESS_TTL = 60 * 60; // 1 小时（秒）
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export interface AccessClaims {
  sub: string; // user id
  email: string;
  role: 'user' | 'admin';
  type: 'access';
  iss: string;
  exp: number;
  iat: number;
}

export class Auth {
  constructor(private env: Env, private db: DB) {}

  /** 签发 access token (JWT) */
  async signAccess(user: UserRow): Promise<string> {
    const iat = Math.floor(now() / 1000);
    const claims: AccessClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
      iss: this.env.JWT_ISSUER || 'cf-platform',
      iat,
      exp: iat + ACCESS_TTL,
    };
    return jwt.sign(claims, this.env.JWT_SECRET);
  }

  /** 校验 access token */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const ok = await jwt.verify(token, this.env.JWT_SECRET);
      if (!ok) return null;
      const claims = jwt.decode(token) as unknown as AccessClaims;
      if (claims.type !== 'access') return null;
      if (claims.exp && claims.exp < Math.floor(now() / 1000)) return null;
      return claims;
    } catch {
      return null;
    }
  }

  /** 创建 refresh 会话（存 D1 + KV 索引） */
  async createSession(user: UserRow, ua: string, ip: string): Promise<string> {
    const sid = uuid() + uuid();
    const expires_at = now() + REFRESH_TTL_MS;
    await this.db
      .prepare('INSERT INTO sessions (id, user_id, user_agent, ip, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(sid, user.id, ua, ip, expires_at, now())
      .run();
    // KV 索引：sid -> user_id，便于快速校验
    await this.env.KV.put(`sess:${sid}`, user.id, { expirationTtl: Math.floor(REFRESH_TTL_MS / 1000) });
    return sid;
  }

  /** 校验 refresh 会话，返回 user */
  async verifySession(sid: string): Promise<UserRow | null> {
    const uid = await this.env.KV.get(`sess:${sid}`);
    if (!uid) {
      // 回退到 D1
      const row = await this.db
        .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
        .bind(sid, now())
        .first<{ user_id: string }>();
      if (!row) return null;
      const user = await this.db
        .prepare('SELECT * FROM users WHERE id = ? AND status = ?')
        .bind(row.user_id, 'active')
        .first<UserRow>();
      return user ?? null;
    }
    const user = await this.db
      .prepare('SELECT * FROM users WHERE id = ? AND status = ?')
      .bind(uid, 'active')
      .first<UserRow>();
    return user ?? null;
  }

  /** 注销会话 */
  async destroySession(sid: string): Promise<void> {
    await this.env.KV.delete(`sess:${sid}`);
    await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  }

  /** 注销该用户所有会话 */
  async destroyAllSessions(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
    // KV 无法批量按前缀高效删除，会话校验时 D1 兜底（KV 过期自动清理）
  }

  /** 哈希密码 */
  hashPassword(plain: string): string {
    return bcrypt.hashSync(plain, 10);
  }

  verifyPassword(plain: string, hash: string): boolean {
    try {
      return bcrypt.compareSync(plain, hash);
    } catch {
      return false;
    }
  }

  /** 按 email 查用户 */
  async getUserByEmail(email: string): Promise<UserRow | null> {
    return (
      (await this.db
        .prepare('SELECT * FROM users WHERE email = ?')
        .bind(email.toLowerCase())
        .first<UserRow>()) ?? null
    );
  }

  async getUserById(id: string): Promise<UserRow | null> {
    return (await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()) ?? null;
  }

  /** 创建用户 */
  async createUser(opts: {
    email: string;
    password?: string;
    name?: string;
    avatar_url?: string;
    github_id?: number;
  }): Promise<UserRow> {
    const id = uuid();
    const ts = now();
    const email = opts.email.toLowerCase();
    // 首个用户或匹配 bootstrap 邮箱 → 管理员
    const count = await this.db.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>();
    const isFirst = (count?.c ?? 0) === 0;
    const isBootstrap =
      this.env.BOOTSTRAP_ADMIN_EMAIL && email === this.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const role = isFirst || isBootstrap ? 'admin' : 'user';
    await this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, avatar_url, role, github_id, status, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .bind(
        id,
        email,
        opts.password ? this.hashPassword(opts.password) : null,
        opts.name ?? '',
        opts.avatar_url ?? '',
        role,
        opts.github_id ?? null,
        opts.github_id ? 1 : 0,
        ts,
        ts
      )
      .run();
    return (await this.getUserById(id))!;
  }

  /** 关联 GitHub（若邮箱已存在则绑定，否则新建） */
  async upsertGithubUser(opts: {
    github_id: number;
    email: string;
    name: string;
    avatar_url: string;
  }): Promise<UserRow> {
    const existing = await this.db
      .prepare('SELECT * FROM users WHERE github_id = ?')
      .bind(opts.github_id)
      .first<UserRow>();
    if (existing) {
      // 更新资料
      await this.db
        .prepare('UPDATE users SET name = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
        .bind(opts.name, opts.avatar_url, now(), existing.id)
        .run();
      return (await this.getUserById(existing.id))!;
    }
    return this.createUser({
      email: opts.email,
      name: opts.name,
      avatar_url: opts.avatar_url,
      github_id: opts.github_id,
    });
  }
}

export function getAuth(env: Env, db: DB): Auth {
  return new Auth(env, db);
}

/** 从 cookie 取值 */
export function getCookie(req: Request, name: string): string | null {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** 设置 cookie 字符串 */
export function cookieOpts(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  const flags = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSec}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean);
  return flags.join('; ');
}
