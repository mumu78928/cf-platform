// 落地页 + 登录/注册页 + 租户站点渲染
// 落地页/租户页用 JSX（无 Alpine 指令）；登录/注册/重置用 hono/html 模板（含 Alpine）

import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import type { Env } from '../env';
import { Layout } from '../ui/layout';
import { markdownToHtml, escapeHtml } from '../lib/utils';

export const pages = new Hono<{ Bindings: Env }>();

// ─── 落地页（JSX，无 Alpine）────────────────────────────
export function landingPage(env: Env) {
  const name = env.PLATFORM_NAME || 'CF Platform';
  return (
    <Layout title={`${name} · 一站式 Cloudflare 平台`}>
      <nav class="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div class="flex items-center gap-2 font-bold text-lg"><span>☁️</span><span>{name}</span></div>
        <div class="flex gap-3">
          <a href="/login" class="px-4 py-2 text-sm text-slate-600 hover:text-indigo-600">登录</a>
          <a href="/register" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">注册</a>
        </div>
      </nav>
      <main class="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 class="text-5xl font-extrabold tracking-tight text-slate-900">基于 Cloudflare 的<br />全栈 SaaS 平台</h1>
        <p class="mt-6 text-lg text-slate-600">Workers AI · D1 · KV · R2 · 二级域名分发 · OAuth 登录 · 外接 API · MCP 接入</p>
        <div class="mt-10 flex justify-center gap-4">
          <a href="/register" class="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">立即开始</a>
          <a href="/admin" class="px-6 py-3 border border-slate-300 rounded-lg font-medium hover:bg-slate-100">管理后台</a>
        </div>
        <div class="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
          {[
            ['⚡ 边缘计算', 'Workers 全球低延迟'],
            ['🗄️ D1 数据库', 'SQLite 关系型存储'],
            ['🌐 二级域名', '自动分发子站点'],
            ['🤖 Workers AI', '内置 LLM 与向量'],
            ['🔑 OAuth', 'GitHub 一键登录'],
            ['📧 邮件服务', 'SMTP / API 双模式'],
            ['🔌 外接 API', 'API Key 鉴权'],
            ['🛠️ MCP 接入', 'JSON-RPC 工具协议'],
          ].map(([t, d]) => (
            <div class="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div class="font-semibold text-slate-900">{t}</div>
              <div class="text-sm text-slate-500 mt-1">{d}</div>
            </div>
          ))}
        </div>
      </main>
      <footer class="text-center text-sm text-slate-400 py-10">Powered by Cloudflare · {name}</footer>
    </Layout>
  );
}

// ─── 公共 head 片段 ──────────────────────────────────────
const HTML_SHELL = (title: string, body: string) => html`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☁️</text></svg>" />
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">${raw(body)}</body>
</html>`;

// ─── 登录页 ───────────────────────────────────────────────
pages.get('/login', (c) => {
  const error = c.req.query('error');
  const errMap: Record<string, string> = { oauth: 'GitHub 登录失败', noemail: 'GitHub 账号无可用邮箱' };
  const errHtml = error ? `<div class="mb-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">${escapeHtml(errMap[error] || error)}</div>` : '';
  const body = `
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
      <h1 class="text-2xl font-bold text-center mb-6">登录</h1>
      ${errHtml}
      <form x-data="loginForm()" @submit.prevent="login()" class="space-y-4">
        <input x-model="email" type="email" required placeholder="邮箱" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        <input x-model="password" type="password" required placeholder="密码" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        <p x-ref="err" class="text-sm text-red-600"></p>
        <button class="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">登录</button>
      </form>
      <div class="my-4 flex items-center gap-3 text-xs text-slate-400"><div class="flex-1 h-px bg-slate-200"></div>或<div class="flex-1 h-px bg-slate-200"></div></div>
      <a href="/auth/github" class="block w-full py-2.5 bg-slate-900 text-white rounded-lg font-medium text-center hover:bg-slate-800">使用 GitHub 登录</a>
      <div class="mt-4 text-sm text-center text-slate-500"><a href="/register" class="text-indigo-600">没有账号？注册</a> · <a href="/forgot" class="text-indigo-600">忘记密码</a></div>
    </div>
  </div>
  <script>
    function loginForm(){ return { email:'', password:'', async login(){ const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:this.email,password:this.password})}); if(r.ok){location.href='/admin'}else{const e=await r.json(); this.$refs.err.textContent=e.error||'登录失败'} } } }
  </script>`;
  return c.html(HTML_SHELL('登录', body));
});

// ─── 注册页 ───────────────────────────────────────────────
pages.get('/register', (c) => {
  const body = `
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
      <h1 class="text-2xl font-bold text-center mb-6">注册</h1>
      <form x-data="registerForm()" @submit.prevent="register()" class="space-y-4">
        <input x-model="name" type="text" placeholder="昵称（可选）" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        <input x-model="email" type="email" required placeholder="邮箱" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        <input x-model="password" type="password" required placeholder="密码（至少 8 位）" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        <p x-ref="msg" class="text-sm min-h-[1.25rem]"></p>
        <button class="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">注册</button>
      </form>
      <div class="my-4 flex items-center gap-3 text-xs text-slate-400"><div class="flex-1 h-px bg-slate-200"></div>或<div class="flex-1 h-px bg-slate-200"></div></div>
      <a href="/auth/github" class="block w-full py-2.5 bg-slate-900 text-white rounded-lg font-medium text-center hover:bg-slate-800">使用 GitHub 注册</a>
      <div class="mt-4 text-sm text-center text-slate-500">已有账号？<a href="/login" class="text-indigo-600">登录</a></div>
      <div class="mt-3 text-xs text-slate-400 text-center">注册后将向邮箱发送验证码，可在后台验证</div>
    </div>
  </div>
  <script>
    function registerForm(){ return { name:'',email:'',password:'', async register(){ const r=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:this.name,email:this.email,password:this.password})}); const e=await r.json(); if(r.ok){ this.$refs.msg.textContent=e.message||'注册成功'; this.$refs.msg.className='text-sm text-green-600'; }else{ this.$refs.msg.textContent=e.error||'注册失败'; this.$refs.msg.className='text-sm text-red-600'; } } } }
  </script>`;
  return c.html(HTML_SHELL('注册', body));
});

// ─── 忘记密码 ─────────────────────────────────────────────
pages.get('/forgot', (c) => {
  const body = `
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
      <h1 class="text-2xl font-bold text-center mb-6">重置密码</h1>
      <form x-data="{ step:1, email:'', code:'', password:'' }" class="space-y-4">
        <input x-show="step==1" x-model="email" type="email" required placeholder="邮箱" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg" />
        <button x-show="step==1" @click="async()=>{ await fetch('/auth/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); step=2 }" class="w-full py-2.5 bg-indigo-600 text-white rounded-lg">发送验证码</button>
        <input x-show="step==2" x-model="code" placeholder="验证码" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg" />
        <input x-show="step==2" x-model="password" type="password" placeholder="新密码（至少8位）" class="w-full px-4 py-2.5 border border-slate-300 rounded-lg" />
        <button x-show="step==2" @click="async()=>{ const r=await fetch('/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code,password})}); if((await r.json()).ok){ location.href='/login' } }" class="w-full py-2.5 bg-indigo-600 text-white rounded-lg">重置密码</button>
      </form>
      <div class="mt-4 text-sm text-center"><a href="/login" class="text-indigo-600">返回登录</a></div>
    </div>
  </div>`;
  return c.html(HTML_SHELL('重置密码', body));
});

// ─── 租户站点页面（JSX）───────────────────────────────────
export function tenantPage(opts: { title: string; content: string; description: string; subdomain: string; baseDomain: string; platformName: string }) {
  const htmlBody = markdownToHtml(opts.content || '# ' + escapeHtml(opts.title || opts.subdomain));
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{opts.title || opts.subdomain}</title>
        {opts.description && <meta name="description" content={opts.description} />}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-white text-slate-800 min-h-screen">
        <div class="max-w-2xl mx-auto px-6 py-16 prose prose-slate">
          <div set:html={htmlBody} />
          <hr class="my-10 border-slate-200" />
          <footer class="text-sm text-slate-400 text-center">
            <a href={`https://${opts.baseDomain}`} class="hover:text-indigo-600">Powered by {opts.platformName}</a>
          </footer>
        </div>
      </body>
    </html>
  );
}

export function notFoundPage() {
  return (
    <html lang="zh-CN">
      <head><meta charset="utf-8" /><title>站点不存在</title><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="min-h-screen flex items-center justify-center bg-slate-50">
        <div class="text-center">
          <div class="text-6xl mb-4">🚫</div>
          <h1 class="text-2xl font-bold text-slate-700">该子域名尚未创建</h1>
          <p class="mt-2 text-slate-500">去主站注册并认领你的子域名吧</p>
          <a href="/" class="inline-block mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-lg">返回首页</a>
        </div>
      </body>
    </html>
  );
}
