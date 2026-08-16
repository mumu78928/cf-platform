// MCP (Model Context Protocol) 服务端 —— JSON-RPC 2.0 over Streamable HTTP
// 传输：POST /mcp（单次请求/响应），GET /mcp（SSE，可选）
// 鉴权：Authorization: Bearer <api_key> → 解析出用户

import type { Env, UserRow } from '../env';
import { DB } from './db';
import { getAI, type ChatMessage } from './ai';

export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

const SERVER_INFO = {
  name: 'cf-platform-mcp',
  version: '1.0.0',
};

const PROTOCOL_VERSION = '2024-11-05';

export class McpServer {
  constructor(private env: Env, private db: DB, private user: UserRow) {}

  tools(): McpTool[] {
    return [
      {
        name: 'ai_chat',
        description: '与平台内置 Workers AI 模型对话。可指定 system 提示词。',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '用户消息' },
            system: { type: 'string', description: '可选 system 提示词' },
            model: { type: 'string', description: '可选模型覆盖' },
          },
          required: ['message'],
        },
      },
      {
        name: 'domain_create',
        description: '为当前用户创建/认领一个子域名站点。',
        inputSchema: {
          type: 'object',
          properties: {
            subdomain: { type: 'string', description: '子域名（3-32位，字母开头）' },
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['subdomain'],
        },
      },
      {
        name: 'domain_list',
        description: '列出当前用户名下所有子域名站点。',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'domain_page_update',
        description: '更新某子域名站点的页面内容（Markdown）。',
        inputSchema: {
          type: 'object',
          properties: {
            subdomain: { type: 'string' },
            content: { type: 'string', description: 'Markdown 内容' },
            title: { type: 'string' },
          },
          required: ['subdomain', 'content'],
        },
      },
      {
        name: 'user_info',
        description: '获取当前 API Key 所属用户信息。',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'api_stats',
        description: '获取当前用户最近 7 天的 API 调用统计。',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  async handle(req: McpRequest): Promise<McpResponse> {
    const id = req.id ?? null;
    try {
      switch (req.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: {}, resources: {}, prompts: {} },
              serverInfo: SERVER_INFO,
            },
          };
        case 'initialized':
        case 'notifications/initialized':
          return { jsonrpc: '2.0', id, result: {} };
        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: this.tools() } };
        case 'tools/call':
          return await this.callTool(req.params || {});
        case 'resources/list':
          return { jsonrpc: '2.0', id, result: { resources: [] } };
        case 'prompts/list':
          return { jsonrpc: '2.0', id, result: { prompts: [] } };
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          };
      }
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: (e as Error).message || 'Internal error' },
      };
    }
  }

  private async callTool(params: Record<string, unknown>): Promise<McpResponse> {
    const name = params.name as string;
    const args = (params.arguments as Record<string, unknown>) || {};
    const id = null;

    const text = (s: unknown) => ({ type: 'text' as const, text: String(s) });
    const ok = (content: unknown) => ({ jsonrpc: '2.0' as const, id, result: { content: [content] } });

    switch (name) {
      case 'ai_chat': {
        const ai = getAI(this.env, this.db);
        const messages: ChatMessage[] = [];
        if (args.system) messages.push({ role: 'system', content: String(args.system) });
        messages.push({ role: 'user', content: String(args.message) });
        const reply = await ai.chat(messages, args.model as string | undefined);
        return ok(text(reply));
      }
      case 'domain_create': {
        const sub = String(args.subdomain || '').toLowerCase();
        if (!/^[a-z][a-z0-9-]{2,31}$/.test(sub))
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: '子域名格式无效' },
          };
        const exists = await this.db
          .prepare('SELECT id FROM domains WHERE subdomain = ?')
          .bind(sub)
          .first();
        if (exists)
          return { jsonrpc: '2.0', id, error: { code: -32602, message: '子域名已被占用' } };
        const did = crypto.randomUUID();
        const ts = Date.now();
        await this.db
          .prepare(
            'INSERT INTO domains (id, user_id, subdomain, status, title, description, is_custom, custom_host, dns_record_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
          )
          .bind(did, this.user.id, sub, 'active', String(args.title || ''), String(args.description || ''), '', '', ts, ts)
          .run();
        await this.db
          .prepare('INSERT INTO pages (id, domain_id, content, theme, updated_at) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), did, '# ' + (args.title || sub), 'default', ts)
          .run();
        return ok(text(`已创建子域名 ${sub}.${this.env.BASE_DOMAIN}`));
      }
      case 'domain_list': {
        const rows = await this.db
          .prepare('SELECT subdomain, status, title, description, created_at FROM domains WHERE user_id = ? ORDER BY created_at DESC')
          .bind(this.user.id)
          .all();
        return ok(text(JSON.stringify(rows.results, null, 2)));
      }
      case 'domain_page_update': {
        const sub = String(args.subdomain || '');
        const dom = await this.db
          .prepare('SELECT id FROM domains WHERE user_id = ? AND subdomain = ?')
          .bind(this.user.id, sub)
          .first<{ id: string }>();
        if (!dom) return { jsonrpc: '2.0', id, error: { code: -32602, message: '站点不存在' } };
        await this.db
          .prepare('UPDATE pages SET content = ?, updated_at = ? WHERE domain_id = ?')
          .bind(String(args.content), Date.now(), dom.id)
          .run();
        if (args.title) {
          await this.db
            .prepare('UPDATE domains SET title = ?, updated_at = ? WHERE id = ?')
            .bind(String(args.title), Date.now(), dom.id)
            .run();
        }
        return ok(text(`已更新 ${sub} 的页面`));
      }
      case 'user_info': {
        return ok(
          text(
            JSON.stringify({
              id: this.user.id,
              email: this.user.email,
              name: this.user.name,
              role: this.user.role,
            })
          )
        );
      }
      case 'api_stats': {
        const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const rows = await this.db
          .prepare(
            'SELECT endpoint, COUNT(*) as count FROM api_usage WHERE user_id = ? AND created_at > ? GROUP BY endpoint ORDER BY count DESC'
          )
          .bind(this.user.id, since)
          .all();
        return ok(text(JSON.stringify(rows.results, null, 2)));
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
    }
  }
}
