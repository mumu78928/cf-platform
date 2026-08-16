// 管理后台单页应用（Alpine.js + Tailwind CDN）
// 用 Hono `html` 模板字符串渲染，避免 JSX 对 Alpine 指令（@click / x-data 等）的解析限制。
// 通过 hash 路由切换模块，数据来自 /account/* 与 /admin/api/*

import { html, raw } from 'hono/html';
import type { UserRow } from '../env';

export function adminShell(opts: { user: UserRow; platformName: string; baseDomain: string }) {
  const { user, platformName, baseDomain } = opts;
  const isAdmin = user.role === 'admin';
  return html`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>管理后台 · ${platformName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☁️</text></svg>" />
</head>
<body class="bg-slate-100">
  <div x-data="adminApp()" x-init="init()" class="min-h-screen flex">
    <aside class="w-60 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col transition-all" :class="{'-ml-60':!open,'ml-0':open}">
      <div class="px-5 py-5 flex items-center gap-2 text-white font-bold"><span>☁️</span><span>${platformName}</span></div>
      <nav class="flex-1 px-2 space-y-1 text-sm">
        <template x-for="item in nav()" :key="item.id">
          <a :href="'#'+item.id" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800"
             :class="tab===item.id ? 'bg-indigo-600 text-white' : ''" x-text="item.label"></a>
        </template>
      </nav>
      <div class="p-3 border-t border-slate-800 text-xs">
        <div class="text-slate-400 truncate" x-text="user?.email"></div>
        <button @click="logout()" class="mt-2 text-red-400 hover:text-red-300">退出登录</button>
      </div>
    </aside>

    <main class="flex-1 min-w-0">
      <header class="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div class="flex items-center gap-3">
          <button @click="open=!open" class="md:hidden text-slate-500">☰</button>
          <h1 class="font-semibold text-lg" x-text="nav().find(i=>i.id===tab)?.label"></h1>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-500">
          <span class="px-2 py-0.5 rounded text-xs" :class="user?.role==='admin'?'bg-purple-100 text-purple-700':'bg-slate-100'" x-text="user?.role==='admin'?'管理员':'用户'"></span>
        </div>
      </header>

      <div class="p-6 max-w-6xl">
        <!-- 仪表盘 -->
        <div x-show="tab==='dashboard'" class="space-y-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <template x-for="s in statsCards" :key="s.label">
              <div class="bg-white rounded-xl p-5 border border-slate-200">
                <div class="text-sm text-slate-500" x-text="s.label"></div>
                <div class="text-2xl font-bold mt-1" x-text="s.value"></div>
              </div>
            </template>
          </div>
          <div class="bg-white rounded-xl p-5 border border-slate-200">
            <h3 class="font-semibold mb-3">最近调用趋势（14天）</h3>
            <div class="flex items-end gap-1 h-40">
              <template x-for="(t,i) in trend" :key="i">
                <div class="flex-1 bg-indigo-500 rounded-t" :style="\`height:\${Math.max(4,(t.count/maxTrend)*100)}%\`" :title="t.day+': '+t.count"></div>
              </template>
            </div>
          </div>
          <div class="bg-white rounded-xl p-5 border border-slate-200">
            <h3 class="font-semibold mb-3">最近审计日志</h3>
            <table class="w-full text-sm">
              <thead class="text-slate-400 text-left"><tr><th class="py-1">时间</th><th>用户</th><th>动作</th><th>详情</th></tr></thead>
              <tbody>
                <template x-for="l in logs" :key="l.id">
                  <tr class="border-t border-slate-100"><td class="py-1.5" x-text="fmt(l.created_at)"></td><td x-text="l.email||l.user_id"></td><td x-text="l.action"></td><td class="text-slate-500" x-text="l.details"></td></tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 我的域名 -->
        <div x-show="tab==='domains'" class="space-y-4">
          <div class="flex justify-between items-center">
            <p class="text-sm text-slate-500">每个子域名即一个可访问站点：<code x-text="'&lt;sub&gt;.'+baseDomain"></code></p>
            <button @click="domainModal={open:true,sub:'',title:'',desc:'',content:''}" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">+ 新建域名</button>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-left"><tr><th class="p-3">子域名</th><th>标题</th><th>状态</th><th>更新时间</th><th></th></tr></thead>
              <tbody>
                <template x-for="d in domains" :key="d.id">
                  <tr class="border-t border-slate-100">
                    <td class="p-3"><a :href="'https://'+d.subdomain+'.'+baseDomain" target="_blank" class="text-indigo-600" x-text="d.subdomain+'.'+baseDomain"></a></td>
                    <td x-text="d.title"></td>
                    <td><span class="text-xs px-2 py-0.5 rounded" :class="d.status==='active'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'" x-text="d.status"></span></td>
                    <td class="text-slate-400" x-text="fmt(d.updated_at)"></td>
                    <td class="text-right pr-3 space-x-2">
                      <button @click="editDomain(d)" class="text-indigo-600">编辑</button>
                      <button @click="delDomain(d)" class="text-red-600">删除</button>
                    </td>
                  </tr>
                </template>
                <tr x-show="domains.length===0"><td colspan="5" class="p-8 text-center text-slate-400">还没有域名，点击右上角新建</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- API Key -->
        <div x-show="tab==='apikeys'" class="space-y-4">
          <div class="flex justify-between items-center">
            <p class="text-sm text-slate-500">用于外接 API（<code>/api/v1/*</code>）与 MCP（<code>/mcp</code>）鉴权</p>
            <button @click="keyName=''; newKey=null; keyModal=true" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">+ 新建 Key</button>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-left"><tr><th class="p-3">名称</th><th>前缀</th><th>最近使用</th><th>创建时间</th><th></th></tr></thead>
              <tbody>
                <template x-for="k in keys" :key="k.id">
                  <tr class="border-t border-slate-100">
                    <td class="p-3" x-text="k.name"></td>
                    <td class="font-mono text-xs" x-text="k.key_prefix+'…'"></td>
                    <td class="text-slate-400" x-text="k.last_used_at?fmt(k.last_used_at):'—'"></td>
                    <td class="text-slate-400" x-text="fmt(k.created_at)"></td>
                    <td class="text-right pr-3"><button @click="delKey(k)" class="text-red-600">删除</button></td>
                  </tr>
                </template>
                <tr x-show="keys.length===0"><td colspan="5" class="p-8 text-center text-slate-400">还没有 API Key</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 用户管理 -->
        <div x-show="tab==='users'" class="space-y-4">
          <input x-model="userQuery" @input.debounce.300ms="loadUsers()" placeholder="搜索邮箱/昵称" class="w-full px-4 py-2 border border-slate-300 rounded-lg" />
          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-left"><tr><th class="p-3">邮箱</th><th>昵称</th><th>角色</th><th>状态</th><th>注册时间</th><th></th></tr></thead>
              <tbody>
                <template x-for="u in users" :key="u.id">
                  <tr class="border-t border-slate-100">
                    <td class="p-3" x-text="u.email"></td>
                    <td x-text="u.name"></td>
                    <td><select :value="u.role" @change="updUser(u.id,{role:$event.target.value})" class="text-xs border border-slate-200 rounded px-1 py-0.5"><option value="user">user</option><option value="admin">admin</option></select></td>
                    <td><select :value="u.status" @change="updUser(u.id,{status:$event.target.value})" class="text-xs border border-slate-200 rounded px-1 py-0.5"><option value="active">active</option><option value="banned">banned</option></select></td>
                    <td class="text-slate-400" x-text="fmt(u.created_at)"></td>
                    <td class="text-right pr-3"><button @click="delUser(u)" class="text-red-600">删除</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 全部域名 -->
        <div x-show="tab==='allDomains'" class="space-y-4">
          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-left"><tr><th class="p-3">子域名</th><th>所有者</th><th>标题</th><th>状态</th><th></th></tr></thead>
              <tbody>
                <template x-for="d in allDomains" :key="d.id">
                  <tr class="border-t border-slate-100">
                    <td class="p-3" x-text="d.subdomain"></td>
                    <td class="text-slate-500" x-text="d.owner_email"></td>
                    <td x-text="d.title"></td>
                    <td><select :value="d.status" @change="updAllDomain(d.id,{status:$event.target.value})" class="text-xs border border-slate-200 rounded px-1 py-0.5"><option value="active">active</option><option value="suspended">suspended</option></select></td>
                    <td class="text-right pr-3"><button @click="delAllDomain(d)" class="text-red-600">删除</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 邮件设置 -->
        <div x-show="tab==='email'" class="max-w-2xl space-y-4">
          <div class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 class="font-semibold">邮件服务商</h3>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center gap-2 text-sm"><input type="radio" value="api" x-model="email.provider" /> HTTP API（Resend/Mailgun/SendGrid/通用）</label>
              <label class="flex items-center gap-2 text-sm"><input type="radio" value="smtp" x-model="email.provider" /> SMTP（原生 TCP+TLS）</label>
              <label class="flex items-center gap-2 text-sm"><input type="radio" value="none" x-model="email.provider" /> 关闭</label>
            </div>
            <div><label class="text-sm text-slate-500">发件地址</label><input x-model="email.from" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
          </div>
          <div x-show="email.provider==='api'" class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 class="font-semibold">API 配置</h3>
            <div><label class="text-sm text-slate-500">服务商</label>
              <select x-model="email.config.api_provider" class="w-full px-3 py-2 border border-slate-300 rounded-lg">
                <option value="resend">Resend</option><option value="mailgun">Mailgun</option><option value="sendgrid">SendGrid</option><option value="generic">通用 HTTP</option>
              </select>
            </div>
            <div x-show="email.config.api_provider==='mailgun'"><label class="text-sm text-slate-500">Mailgun 域名</label><input x-model="email.config.api_domain" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
            <div x-show="email.config.api_provider==='generic'"><label class="text-sm text-slate-500">HTTP Endpoint</label><input x-model="email.config.api_endpoint" placeholder="https://..." class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
            <div><label class="text-sm text-slate-500">API Key</label><input x-model="email.config.api_key" type="password" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
          </div>
          <div x-show="email.provider==='smtp'" class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 class="font-semibold">SMTP 配置（推荐端口 465 隐式 TLS）</h3>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="text-sm text-slate-500">主机</label><input x-model="email.config.smtp_host" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
              <div><label class="text-sm text-slate-500">端口</label><input x-model.number="email.config.smtp_port" type="number" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
              <div><label class="text-sm text-slate-500">用户名</label><input x-model="email.config.smtp_user" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
              <div><label class="text-sm text-slate-500">密码</label><input x-model="email.config.smtp_pass" type="password" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
            </div>
          </div>
          <div class="flex gap-3">
            <button @click="saveEmail()" class="px-5 py-2 bg-indigo-600 text-white rounded-lg">保存配置</button>
            <button @click="testEmail()" class="px-5 py-2 border border-slate-300 rounded-lg">发送测试邮件</button>
          </div>
          <p x-show="emailMsg" class="text-sm" x-text="emailMsg"></p>
        </div>

        <!-- 系统设置 -->
        <div x-show="tab==='settings'" class="max-w-2xl space-y-4">
          <div class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 class="font-semibold">站点与 AI 设置</h3>
            <div><label class="text-sm text-slate-500">平台名称</label><input x-model="settings.platform_name" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
            <div><label class="text-sm text-slate-500">AI 聊天模型</label><input x-model="settings.ai_model" placeholder="@cf/meta/llama-3.1-8b-instruct" class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm" /></div>
            <div><label class="text-sm text-slate-500">AI 嵌入模型</label><input x-model="settings.ai_embedding_model" class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm" /></div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" x-model="settings.allow_registration" /> 允许注册</label>
            <div><label class="text-sm text-slate-500">默认页面模板</label><textarea x-model="settings.default_page_template" rows="4" class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"></textarea></div>
            <button @click="saveSettings()" class="px-5 py-2 bg-indigo-600 text-white rounded-lg">保存</button>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 p-5">
            <h3 class="font-semibold mb-2">接入信息</h3>
            <div class="text-sm space-y-1 text-slate-600 font-mono">
              <div>外接 API 基址：<span class="text-indigo-600">/api/v1</span></div>
              <div>MCP 端点：<span class="text-indigo-600">/mcp</span>（JSON-RPC 2.0，Bearer API Key）</div>
              <div>AI 聊天：<span class="text-indigo-600">POST /api/v1/ai/chat</span></div>
              <div>AI 流式：<span class="text-indigo-600">POST /api/v1/ai/chat/stream</span>（SSE）</div>
            </div>
          </div>
        </div>

        <!-- 审计日志 -->
        <div x-show="tab==='logs'" class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-left"><tr><th class="p-3">时间</th><th>用户</th><th>动作</th><th>详情</th><th>IP</th></tr></thead>
            <tbody>
              <template x-for="l in logsFull" :key="l.id">
                <tr class="border-t border-slate-100"><td class="p-3" x-text="fmt(l.created_at)"></td><td x-text="l.email||l.user_id"></td><td x-text="l.action"></td><td class="text-slate-500" x-text="l.details"></td><td class="text-slate-400" x-text="l.ip"></td></tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- 个人资料 -->
        <div x-show="tab==='profile'" class="max-w-md space-y-4">
          <div class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 class="font-semibold">个人资料</h3>
            <div><label class="text-sm text-slate-500">邮箱</label><input :value="user?.email" disabled class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" /></div>
            <div><label class="text-sm text-slate-500">昵称</label><input x-model="profileName" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
            <button @click="saveProfile()" class="px-5 py-2 bg-indigo-600 text-white rounded-lg">保存</button>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- 域名编辑弹窗 -->
  <div x-show="domainModal.open" x-cloak class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="domainModal.open=false">
    <div class="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
      <h3 class="font-semibold text-lg mb-4" x-text="domainModal.id?'编辑域名':'新建域名'"></h3>
      <div class="space-y-3">
        <div x-show="!domainModal.id"><label class="text-sm text-slate-500">子域名</label><input x-model="domainModal.sub" placeholder="alice" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /><p class="text-xs text-slate-400" x-text="'访问：'+domainModal.sub+'.'+baseDomain"></p></div>
        <div><label class="text-sm text-slate-500">标题</label><input x-model="domainModal.title" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
        <div><label class="text-sm text-slate-500">描述</label><input x-model="domainModal.desc" class="w-full px-3 py-2 border border-slate-300 rounded-lg" /></div>
        <div><label class="text-sm text-slate-500">页面内容（Markdown）</label><textarea x-model="domainModal.content" rows="8" class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"></textarea></div>
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <button @click="domainModal.open=false" class="px-4 py-2 border border-slate-300 rounded-lg">取消</button>
        <button @click="saveDomain()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">保存</button>
      </div>
    </div>
  </div>

  <!-- API Key 弹窗 -->
  <div x-show="keyModal" x-cloak class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="keyModal=false">
    <div class="bg-white rounded-2xl p-6 w-full max-w-md">
      <h3 class="font-semibold text-lg mb-4">新建 API Key</h3>
      <div x-show="!newKey">
        <input x-model="keyName" placeholder="名称（如：生产环境）" class="w-full px-3 py-2 border border-slate-300 rounded-lg" />
        <button @click="createKey()" class="mt-4 w-full py-2 bg-indigo-600 text-white rounded-lg">生成</button>
      </div>
      <div x-show="newKey">
        <p class="text-sm text-amber-600 mb-2">⚠️ 仅显示一次，请立即复制保存：</p>
        <input :value="newKey" readonly class="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-slate-50" @click="$event.target.select()" />
        <button @click="navigator.clipboard.writeText(newKey)" class="mt-3 w-full py-2 bg-slate-800 text-white rounded-lg">复制</button>
        <button @click="keyModal=false; loadKeys()" class="mt-2 w-full py-2 border border-slate-300 rounded-lg">完成</button>
      </div>
    </div>
  </div>

  <style>[x-cloak]{display:none}</style>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script>${raw(adminAppScript({ isAdmin, baseDomain }))}</script>
</body>
</html>`;
}

function adminAppScript({ isAdmin, baseDomain }: { isAdmin: boolean; baseDomain: string }) {
  const navExtra = isAdmin
    ? `items.push({id:'users',label:'👥 用户管理'},{id:'allDomains',label:'🗂️ 全部域名'},{id:'email',label:'📧 邮件设置'},{id:'settings',label:'⚙️ 系统设置'},{id:'logs',label:'📜 审计日志'});`
    : '';
  return `function adminApp(){return{
  open:window.innerWidth>=768,
  tab:location.hash.slice(1)||'dashboard',
  user:null,
  baseDomain:${JSON.stringify(baseDomain)},
  statsCards:[],trend:[],logs:[],
  domains:[],keys:[],users:[],allDomains:[],logsFull:[],
  userQuery:'',profileName:'',
  settings:{platform_name:'',ai_model:'',ai_embedding_model:'',allow_registration:true,default_page_template:''},
  email:{provider:'none',from:'',config:{api_provider:'resend',api_key:'',api_endpoint:'',api_domain:'',smtp_host:'',smtp_port:465,smtp_user:'',smtp_pass:''}},
  emailMsg:'',
  domainModal:{open:false},keyModal:false,keyName:'',newKey:null,
  maxTrend:1,
  async init(){
    window.addEventListener('hashchange',()=>{this.tab=location.hash.slice(1)||'dashboard';this.onTab();});
    const r=await fetch('/auth/me');const j=await r.json();
    if(!j.user){location.href='/login';return;}
    this.user=j.user;this.profileName=j.user.name||'';
    this.onTab();
  },
  nav(){const items=[{id:'dashboard',label:'📊 仪表盘'},{id:'domains',label:'🌐 我的域名'},{id:'apikeys',label:'🔑 API Key'},{id:'profile',label:'👤 个人资料'}];${navExtra}return items;},
  onTab(){if(this.tab==='dashboard')this.loadStats();if(this.tab==='domains')this.loadDomains();if(this.tab==='apikeys')this.loadKeys();if(this.tab==='users')this.loadUsers();if(this.tab==='allDomains')this.loadAllDomains();if(this.tab==='email')this.loadEmail();if(this.tab==='settings')this.loadSettings();if(this.tab==='logs')this.loadLogs();},
  fmt(t){if(!t)return'—';const d=new Date(t);return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});},
  async api(u,o){const r=await fetch(u,o);const j=await r.json();if(!r.ok)throw new Error(j.error||'请求失败');return j;},
  async loadStats(){try{const s=await this.api('/admin/api/stats');this.statsCards=[{label:'用户',value:s.users},{label:'域名',value:s.domains},{label:'API Key',value:s.api_keys},{label:'7天调用',value:s.calls_7d}];this.trend=s.trend||[];this.maxTrend=Math.max(1,...this.trend.map(t=>t.count));this.logs=s.recent_logs||[];}catch(e){}},
  async loadDomains(){try{const j=await this.api('/account/domains');this.domains=j.domains.map(d=>({...d,content:d.content||''}));}catch(e){}},
  editDomain(d){this.domainModal={open:true,id:d.id,sub:d.subdomain,title:d.title,desc:d.description,content:d.content||''};},
  async saveDomain(){const m=this.domainModal;try{if(m.id){await this.api('/account/domains/'+m.sub,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:m.title,description:m.desc,content:m.content})});}else{await this.api('/account/domains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subdomain:m.sub,title:m.title,description:m.desc,content:m.content})});}m.open=false;this.loadDomains();}catch(e){alert(e.message);}},
  async delDomain(d){if(!confirm('确认删除 '+d.subdomain+'？'))return;try{await this.api('/account/domains/'+d.subdomain,{method:'DELETE'});this.loadDomains();}catch(e){alert(e.message);}},
  async loadKeys(){try{const j=await this.api('/account/api-keys');this.keys=j.keys;}catch(e){}},
  async createKey(){try{const j=await this.api('/account/api-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:this.keyName||'default'})});this.newKey=j.key;}catch(e){alert(e.message);}},
  async delKey(k){if(!confirm('删除 Key '+k.name+'？'))return;await this.api('/account/api-keys/'+k.id,{method:'DELETE'});this.loadKeys();},
  async loadUsers(){try{const j=await this.api('/admin/api/users?q='+encodeURIComponent(this.userQuery));this.users=j.users;}catch(e){}},
  async updUser(id,p){await this.api('/admin/api/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});},
  async delUser(u){if(!confirm('删除用户 '+u.email+'？'))return;await this.api('/admin/api/users/'+u.id,{method:'DELETE'});this.loadUsers();},
  async loadAllDomains(){try{const j=await this.api('/admin/api/domains');this.allDomains=j.domains;}catch(e){}},
  async updAllDomain(id,p){await this.api('/admin/api/domains/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});},
  async delAllDomain(d){if(!confirm('删除域名 '+d.subdomain+'？'))return;await this.api('/admin/api/domains/'+d.id,{method:'DELETE'});this.loadAllDomains();},
  async loadEmail(){try{const j=await this.api('/admin/api/email/config');this.email.provider=j.provider;this.email.from=j.from;this.email.config={api_provider:'resend',api_key:'',api_endpoint:'',api_domain:'',smtp_host:'',smtp_port:465,smtp_user:'',smtp_pass:'',...(j.config||{})};}catch(e){}},
  async saveEmail(){try{await this.api('/admin/api/email/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:this.email.provider,from:this.email.from,config:this.email.config})});this.emailMsg='✅ 已保存';setTimeout(()=>this.emailMsg='',2000);}catch(e){this.emailMsg='❌ '+e.message;}},
  async testEmail(){const to=prompt('收件邮箱：',this.user.email);if(!to)return;try{const j=await this.api('/admin/api/email/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to})});this.emailMsg=j.ok?'✅ 发送成功':'❌ '+(j.error||'失败');}catch(e){this.emailMsg='❌ '+e.message;}},
  async loadSettings(){try{const j=await this.api('/admin/api/settings');const s=j.settings||{};this.settings={platform_name:s.platform_name||'',ai_model:s.ai_model||'',ai_embedding_model:s.ai_embedding_model||'',allow_registration:s.allow_registration===true||s.allow_registration==='true',default_page_template:s.default_page_template||''};}catch(e){}},
  async saveSettings(){try{await this.api('/admin/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.settings)});alert('已保存');}catch(e){alert(e.message);}},
  async loadLogs(){try{const j=await this.api('/admin/api/logs?size=100');this.logsFull=j.logs;}catch(e){}},
  async saveProfile(){try{await this.api('/account/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:this.profileName})});this.user.name=this.profileName;alert('已保存');}catch(e){alert(e.message);}},
  async logout(){await fetch('/auth/logout',{method:'POST'});location.href='/';},
}};`;
}
