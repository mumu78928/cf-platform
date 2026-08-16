// HTML 布局组件 + 渲染助手

import type { FC } from 'hono/jsx';

export const TAILWIND = '<script src="https://cdn.tailwindcss.com"></script>';
export const ALPINE = '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>';

export const Layout: FC<{ title: string; children: any }> = ({ children, title }) => {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☁️</text></svg>" />
      </head>
      <body class="bg-slate-50 text-slate-800 min-h-screen">{children}</body>
    </html>
  );
};

export const Avatar: FC<{ user: { name: string; avatar_url?: string; email: string } }> = ({ user }) => {
  if (user.avatar_url) return <img src={user.avatar_url} alt={user.name} class="w-8 h-8 rounded-full" />;
  const init = (user.name || user.email || '?').charAt(0).toUpperCase();
  return <div class="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-semibold">{init}</div>;
};
