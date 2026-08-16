// 邮件发送库：支持 API（Resend/Mailgun/SendGrid/通用 HTTP）与 SMTP（cloudflare:sockets 原生 TCP+TLS）

import type { Env } from '../env';
import { DB } from './db';

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<{ ok: boolean; error?: string; id?: string }>;
}

export interface EmailConfig {
  provider: 'api' | 'smtp' | 'none';
  from: string;
  // API 模式
  api_provider?: 'resend' | 'mailgun' | 'sendgrid' | 'generic';
  api_key?: string;
  api_endpoint?: string; // generic 模式必填
  api_domain?: string; // mailgun 域名
  // SMTP 模式
  smtp_host?: string;
  smtp_port?: number; // 默认 465 (implicit TLS)
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
}

/** 根据 D1 设置构建当前邮件服务 */
export async function buildEmailProvider(env: Env, db: DB): Promise<EmailProvider> {
  const provider = (await db.getSetting('email_provider', 'none')) as EmailConfig['provider'];
  const from = await db.getSetting('email_from', `noreply@${env.BASE_DOMAIN}`);
  const config = await db.getSettingJSON<Partial<EmailConfig>>('email_config', {});
  return getEmailProvider({ from, provider, ...config });
}

export function getEmailProvider(cfg: EmailConfig): EmailProvider {
  switch (cfg.provider) {
    case 'api':
      return new ApiEmailProvider(cfg);
    case 'smtp':
      return new SmtpEmailProvider(cfg);
    default:
      return new NoneProvider();
  }
}

class NoneProvider implements EmailProvider {
  async send() {
    return { ok: false, error: '邮件服务未配置（provider=none）' };
  }
}

// ─── HTTP API 供应商 ─────────────────────────────────────────────
export class ApiEmailProvider implements EmailProvider {
  constructor(private cfg: EmailConfig) {}

  async send(msg: EmailMessage): Promise<{ ok: boolean; error?: string; id?: string }> {
    const from = msg.from || this.cfg.from;
    try {
      switch (this.cfg.api_provider) {
        case 'resend':
          return await this.resend(msg, from);
        case 'mailgun':
          return await this.mailgun(msg, from);
        case 'sendgrid':
          return await this.sendgrid(msg, from);
        case 'generic':
        default:
          return await this.generic(msg, from);
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private async resend(msg: EmailMessage, from: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${body}` };
    const data = JSON.parse(body) as { id?: string };
    return { ok: true, id: data.id };
  }

  private async mailgun(msg: EmailMessage, from: string) {
    const domain = this.cfg.api_domain;
    if (!domain) return { ok: false, error: 'mailgun 缺少 api_domain' };
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`api:${this.cfg.api_key}`),
      },
      body: new URLSearchParams({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html || '',
        text: msg.text || '',
      }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Mailgun ${res.status}: ${body}` };
    return { ok: true };
  }

  private async sendgrid(msg: EmailMessage, from: string) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: from },
        subject: msg.subject,
        content: [
          { type: 'text/plain', value: msg.text || '' },
          ...(msg.html ? [{ type: 'text/html', value: msg.html }] : []),
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `SendGrid ${res.status}: ${body}` };
    }
    return { ok: true };
  }

  /** 通用 HTTP：POST JSON { from, to, subject, html, text }，期望 2xx */
  private async generic(msg: EmailMessage, from: string) {
    if (!this.cfg.api_endpoint) return { ok: false, error: 'generic 缺少 api_endpoint' };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cfg.api_key) headers['Authorization'] = `Bearer ${this.cfg.api_key}`;
    const res = await fetch(this.cfg.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Generic ${res.status}: ${body}` };
    }
    return { ok: true };
  }
}

// ─── SMTP 供应商（cloudflare:sockets 原生 TCP + 隐式 TLS）─────────
export class SmtpEmailProvider implements EmailProvider {
  constructor(private cfg: EmailConfig) {}

  async send(msg: EmailMessage): Promise<{ ok: boolean; error?: string; id?: string }> {
    const host = this.cfg.smtp_host;
    const port = this.cfg.smtp_port || 465;
    const user = this.cfg.smtp_user;
    const pass = this.cfg.smtp_pass;
    if (!host || !user || !pass) return { ok: false, error: 'SMTP 配置不完整' };
    const from = (msg.from || this.cfg.smtp_from || this.cfg.from).trim();

    // 动态导入 socket（仅 Worker 运行时可用）
    const { connect } = await import('cloudflare:sockets');
    const socket = connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const dec = new TextDecoder();
    let buf = '';

    const readLine = async (): Promise<string> => {
      while (true) {
        const idx = buf.indexOf('\r\n');
        if (idx >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          return line;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('SMTP 连接已关闭');
        buf += dec.decode(value, { stream: true });
      }
    };

    /** 读取完整 SMTP 响应（可能多行，最后一行 code 后为空格） */
    const readResponse = async (): Promise<{ code: number; text: string }> => {
      const lines: string[] = [];
      let code = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const line = await readLine();
        lines.push(line);
        code = parseInt(line.slice(0, 3), 10);
        // 第 4 个字符为空格表示最后一行；'-' 表示还有后续行
        if (line.length >= 4 && line[3] === ' ') break;
        if (line.length < 4) break; // 异常短行
      }
      return { code, text: lines.join('\n') };
    };

    const cmd = async (c: string): Promise<{ code: number; text: string }> => {
      await writer.write(new TextEncoder().encode(c + '\r\n'));
      return readResponse();
    };

    try {
      // 1. 服务器问候
      let r = await readResponse();
      if (r.code !== 220) throw new Error(`问候失败: ${r.text}`);

      // 2. EHLO
      r = await cmd(`EHLO ${host}`);
      if (r.code !== 250) throw new Error(`EHLO 失败: ${r.text}`);

      // 3. AUTH LOGIN
      r = await cmd('AUTH LOGIN');
      if (r.code !== 334) throw new Error(`AUTH LOGIN 失败: ${r.text}`);
      r = await cmd(btoa(user));
      if (r.code !== 334) throw new Error(`用户名失败: ${r.text}`);
      r = await cmd(btoa(pass));
      if (r.code !== 235) throw new Error(`认证失败: ${r.text}`);

      // 4. MAIL FROM / RCPT TO / DATA
      r = await cmd(`MAIL FROM:<${from}>`);
      if (r.code !== 250) throw new Error(`MAIL FROM 失败: ${r.text}`);
      r = await cmd(`RCPT TO:<${msg.to}>`);
      if (r.code !== 250) throw new Error(`RCPT TO 失败: ${r.text}`);
      r = await cmd('DATA');
      if (r.code !== 354) throw new Error(`DATA 失败: ${r.text}`);

      // 5. 邮件正文
      const headers = [
        `From: ${from}`,
        `To: ${msg.to}`,
        `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(msg.subject)))}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
      ].join('\r\n');
      const body = btoa(unescape(encodeURIComponent(msg.html || msg.text || '')));
      await writer.write(new TextEncoder().encode(headers + body + '\r\n.\r\n'));
      r = await readResponse();
      if (r.code !== 250) throw new Error(`发送失败: ${r.text}`);

      // 6. QUIT
      await cmd('QUIT');
      return { ok: true };
    } finally {
      try {
        writer.releaseLock();
        reader.releaseLock();
        socket.close();
      } catch {
        /* noop */
      }
    }
  }
}
