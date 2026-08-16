// 环境绑定类型定义

export interface Env {
  // D1
  DB: D1Database;
  // KV
  KV: KVNamespace;
  // R2
  R2: R2Bucket;
  // Workers AI
  AI: Ai;
  // 静态资源
  ASSETS: Fetcher;

  // 非敏感变量
  BASE_DOMAIN: string;
  PLATFORM_NAME: string;
  JWT_ISSUER: string;
  BOOTSTRAP_ADMIN_EMAIL: string;

  // Secrets
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  CF_API_TOKEN: string;
  CF_ZONE_ID: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  avatar_url: string;
  role: 'user' | 'admin';
  github_id: number | null;
  status: 'active' | 'banned';
  email_verified: number;
  created_at: number;
  updated_at: number;
}

export interface DomainRow {
  id: string;
  user_id: string;
  subdomain: string;
  status: 'active' | 'suspended' | 'pending';
  title: string;
  description: string;
  is_custom: number;
  custom_host: string;
  dns_record_id: string;
  created_at: number;
  updated_at: number;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string;
  last_used_at: number | null;
  expires_at: number | null;
  created_at: number;
}

// 通过 auth 中间件注入到 context 的变量
export interface AuthVars {
  user: UserRow | null;
}

declare module 'hono' {
  interface ContextVariableMap extends AuthVars {
    tenant: DomainRow | null;
    apiKey: ApiKeyRow | null;
    apiKeyUser: UserRow | null;
  }
}
