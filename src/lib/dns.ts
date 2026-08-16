// Cloudflare DNS API：用于（可选）自定义域名 / 显式子域名记录管理
// 平台子域名 *.yourdomain.com 依赖通配 DNS + 通配 Workers route，无需逐条创建。
// 本模块仅在管理员为用户配置自定义域名或显式 CNAME 时调用。

import type { Env } from '../env';

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

export class Dns {
  constructor(private env: Env) {}

  private get token(): string {
    return this.env.CF_API_TOKEN;
  }
  private get zone(): string {
    return this.env.CF_ZONE_ID;
  }
  get available(): boolean {
    return !!(this.env.CF_API_TOKEN && this.env.CF_ZONE_ID);
  }

  private base() {
    return `https://api.cloudflare.com/client/v4/zones/${this.zone}/dns_records`;
  }

  async create(opts: {
    type: 'A' | 'CNAME' | 'AAAA' | 'TXT';
    name: string;
    content: string;
    proxied?: boolean;
    ttl?: number;
  }): Promise<DnsRecord | null> {
    if (!this.available) return null;
    const res = await fetch(this.base(), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        type: opts.type,
        name: opts.name,
        content: opts.content,
        proxied: opts.proxied ?? true,
        ttl: opts.ttl ?? 1,
      }),
    });
    const data = (await res.json()) as { success: boolean; result?: DnsRecord; errors?: unknown };
    if (!data.success || !data.result) return null;
    return data.result;
  }

  async delete(recordId: string): Promise<boolean> {
    if (!this.available) return false;
    const res = await fetch(`${this.base()}/${recordId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success;
  }

  async list(name?: string): Promise<DnsRecord[]> {
    if (!this.available) return [];
    const url = new URL(this.base());
    if (name) url.searchParams.set('name', name);
    const res = await fetch(url.toString(), { headers: this.headers() });
    const data = (await res.json()) as { success: boolean; result?: DnsRecord[] };
    return data.result ?? [];
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }
}
