// D1 数据访问层 + 设置读写

import type { Env } from '../env';

export class DB {
  constructor(private d1: D1Database) {}

  prepare(sql: string) {
    return this.d1.prepare(sql);
  }

  async exec(sql: string) {
    return this.d1.exec(sql);
  }

  /** 获取设置值 */
  async getSetting(key: string, fallback = ''): Promise<string> {
    const r = await this.d1
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind(key)
      .first<{ value: string }>();
    return r?.value ?? fallback;
  }

  /** 获取设置值（JSON） */
  async getSettingJSON<T = unknown>(key: string, fallback: T): Promise<T> {
    const v = await this.getSetting(key, '');
    if (!v) return fallback;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }

  /** 写设置值 */
  async setSetting(key: string, value: string): Promise<void> {
    await this.d1
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(key, value)
      .run();
  }

  async setSettingJSON(key: string, value: unknown): Promise<void> {
    await this.setSetting(key, JSON.stringify(value));
  }

  /** 记录审计日志 */
  async audit(opts: { user_id?: string; action: string; details?: string; ip?: string }): Promise<void> {
    await this.d1
      .prepare('INSERT INTO audit_logs (user_id, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(opts.user_id ?? '', opts.action, opts.details ?? '', opts.ip ?? '', Date.now())
      .run();
  }

  /** 记录 API 调用 */
  async logUsage(user_id: string, endpoint: string): Promise<void> {
    await this.d1
      .prepare('INSERT INTO api_usage (user_id, endpoint, created_at) VALUES (?, ?, ?)')
      .bind(user_id, endpoint, Date.now())
      .run();
  }
}

/** 从 Hono context 取 DB 实例 */
export function getDB(env: Env): DB {
  return new DB(env.DB);
}
