// MCP 端点：POST /mcp（JSON-RPC 2.0）

import { Hono } from 'hono';
import type { Env } from '../env';
import { getDB } from '../lib/db';
import { McpServer, type McpRequest } from '../lib/mcp';
import { apiKeyAuth } from '../middleware';

export const mcp = new Hono<{ Bindings: Env }>();

// MCP 端点同样用 API Key 鉴权
mcp.use('*', apiKeyAuth);

mcp.post('/', async (c) => {
  const user = c.var.apiKeyUser!;
  const db = getDB(c.env);
  await db.logUsage(user.id, '/mcp');
  const body = (await c.req.json()) as McpRequest | McpRequest[];
  const server = new McpServer(c.env, db, user);
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((r) => server.handle(r)));
    return c.json(results);
  }
  const res = await server.handle(body);
  return c.json(res);
});

// GET 返回服务说明（便于客户端探测）
mcp.get('/', (c) =>
  c.json({
    name: 'cf-platform-mcp',
    version: '1.0.0',
    protocol: 'JSON-RPC 2.0 over HTTP',
    auth: 'Authorization: Bearer <api_key>',
    methods: ['initialize', 'tools/list', 'tools/call', 'ping'],
  })
);
