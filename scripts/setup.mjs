#!/usr/bin/env node
// 一键初始化 Cloudflare 资源：创建 D1 / KV / R2，并回填 wrangler.toml 中的 id
// 用法： node scripts/setup.mjs
// 前置：已 wrangler login（或设置 CLOUDFLARE_API_TOKEN）

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
    console.error(`命令失败: ${cmd}`);
    console.error(e.stderr?.toString() || e.message);
    process.exit(1);
  }
}

function jsonRun(cmd) {
  const out = run(cmd + ' --json');
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

console.log('🚀 开始初始化 Cloudflare 资源...\n');

let toml = readFileSync(wranglerPath, 'utf8');

// 1. D1
console.log('📦 创建 D1 数据库 cf-platform ...');
const d1 = jsonRun('npx wrangler d1 create cf-platform');
let d1Id = d1?.uuid;
if (!d1Id) {
  // 可能已存在，尝试列表查找
  const list = jsonRun('npx wrangler d1 list');
  const found = Array.isArray(list) ? list.find((x) => x.name === 'cf-platform') : null;
  d1Id = found?.uuid;
}
if (d1Id) {
  toml = toml.replace(/database_id = "REPLACE_WITH_D1_DATABASE_ID"/, `database_id = "${d1Id}"`);
  console.log(`   ✓ D1 id = ${d1Id}`);
} else {
  console.error('   ✗ 未能获取 D1 id，请手动创建');
}

// 2. KV
console.log('📦 创建 KV 命名空间 ...');
const kv = jsonRun('npx wrangler kv namespace create KV');
let kvId = kv?.id;
if (!kvId) {
  // 列表查找（wrangler kv namespace create 已存在时会报错，回退 list）
  const kvList = jsonRun('npx wrangler kv namespace list');
  const found = Array.isArray(kvList) ? kvList.find((x) => x.title === 'KV') : null;
  kvId = found?.id;
}
if (kvId) {
  toml = toml.replace(/id = "REPLACE_WITH_KV_NAMESPACE_ID"/, `id = "${kvId}"`);
  console.log(`   ✓ KV id = ${kvId}`);
} else {
  console.error('   ✗ 未能获取 KV id，请手动创建');
}

// 3. R2（创建 bucket，已存在会报错，忽略）
console.log('📦 创建 R2 bucket cf-platform-assets ...');
try {
  run('npx wrangler r2 bucket create cf-platform-assets');
  console.log('   ✓ R2 bucket 已创建');
} catch {
  console.log('   • R2 bucket 已存在或创建失败（已存在可忽略）');
}

writeFileSync(wranglerPath, toml);
console.log('\n📝 wrangler.toml 已更新');

// 4. 应用本地迁移
console.log('\n🗄️  应用 D1 迁移（本地）...');
try {
  run('npx wrangler d1 migrations apply cf-platform --local');
} catch {
  console.log('   • 本地迁移跳过');
}

console.log('\n✅ 初始化完成！');
console.log('\n后续步骤：');
console.log('  1. 复制 .dev.vars.example → .dev.vars，填写 JWT_SECRET / GitHub OAuth / CF_API_TOKEN');
console.log('  2. 本地开发：npm run dev');
console.log('  3. 远程迁移：npx wrangler d1 migrations apply cf-platform --remote');
console.log('  4. 部署：npm run deploy');
console.log('  5. 设置 Secret：npx wrangler secret put JWT_SECRET  （及其他）');
console.log('  6. Cloudflare DNS：添加 *.yourdomain.com 通配记录（proxied），并给 Worker 配置 routes');
