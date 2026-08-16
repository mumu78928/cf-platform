#!/usr/bin/env node
// 一键初始化 Cloudflare 资源：自动创建 D1 / KV / R2 并回填 wrangler.toml
// 用法： node scripts/setup.mjs
// 前置：已 wrangler login（或设置 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID）

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wranglerPath = join(__dirname, '..', 'wrangler.toml');

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch (e) {
    return e.stdout?.toString()?.trim() || '';
  }
}

function jsonRun(cmd) {
  try {
    return JSON.parse(execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch {
    return null;
  }
}

console.log('开始初始化 Cloudflare 资源...\n');

let toml = readFileSync(wranglerPath, 'utf8');

// ── D1 ──
console.log('创建/获取 D1 数据库 ...');
let d1 = jsonRun('npx wrangler d1 create yumingfenfa --json');
let d1Id = d1?.result?.uuid;
if (!d1Id) {
  const list = jsonRun('npx wrangler d1 list --json');
  if (Array.isArray(list)) {
    const found = list.find(x => x.name === 'yumingfenfa');
    if (found) d1Id = found.uuid;
  }
}
if (d1Id) {
  toml = toml.replace(/database_id = "REPLACE_WITH_D1_DATABASE_ID"/, `database_id = "${d1Id}"`);
  console.log(`  D1 id = ${d1Id}`);
} else {
  console.error('  无法获取 D1 id');
}

// ── KV ──
console.log('创建/获取 KV 命名空间 ...');
let kv = jsonRun('npx wrangler kv namespace create yumingfenfa --json');
let kvId = kv?.result?.id || kv?.id;
if (!kvId) {
  const kvList = jsonRun('npx wrangler kv namespace list --json');
  if (Array.isArray(kvList)) {
    const found = kvList.find(x => x.title === 'yumingfenfa');
    if (found) kvId = found.id;
  }
}
if (kvId) {
  toml = toml.replace(/id = "REPLACE_WITH_KV_NAMESPACE_ID"/, `id = "${kvId}"`);
  console.log(`  KV id = ${kvId}`);
} else {
  console.error('  无法获取 KV id');
}

// ── R2 ──
console.log('创建 R2 bucket ...');
run('npx wrangler r2 bucket create yumingfenfa-assets');
console.log('  R2 bucket 已就绪');

writeFileSync(wranglerPath, toml);
console.log('\nwrangler.toml 已更新');

// ── 本地迁移 ──
console.log('\n应用 D1 迁移（本地）...');
try {
  run('npx wrangler d1 migrations apply yumingfenfa --local');
  console.log('  迁移完成');
} catch {
  console.log('  本地迁移跳过');
}

console.log('\n初始化完成！');
console.log('\n后续步骤：');
console.log('  1. 复制 .dev.vars.example -> .dev.vars，填写 JWT_SECRET / GitHub OAuth / CF_API_TOKEN');
console.log('  2. 本地开发：npm run dev');
console.log('  3. 部署：npm run deploy');
console.log('  4. Cloudflare DNS：添加 *.yourdomain.com 通配记录（proxied），并给 Worker 配置 routes');