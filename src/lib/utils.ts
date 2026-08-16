// 通用工具函数

export const now = () => Date.now();

/** 生成 UUID v4（不依赖 crypto.randomUUID 之外的能力，Workers 支持 randomUUID） */
export const uuid = (): string => crypto.randomUUID();

/** 生成随机 hex 字符串 */
export const randomHex = (bytes: number): string => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** 生成 API key：cfp_<32位hex> */
export const generateApiKey = (): string => 'cfp_' + randomHex(24);

/** sha256 hex */
export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 安全比较字符串（恒定时间） */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 生成 6 位数字验证码 */
export const code6 = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 10).toString()).join('');

/** 校验子域名格式：3-32 位，字母数字-，字母开头 */
export function isValidSubdomain(sub: string): boolean {
  return /^[a-z][a-z0-9-]{2,31}$/.test(sub) && !sub.endsWith('-');
}

/** 校验邮箱 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** JSON 安全解析 */
export function tryParseJSON<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** 转义 HTML */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 客户端 IP 提取 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  );
}

/** 简单 Markdown → HTML（仅支持标题/段落/链接/加粗/代码/列表，足够展示用） */
export function markdownToHtml(md: string): string {
  const esc = escapeHtml;
  const lines = esc(md).split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^######\s+(.*)$/))) out.push(`<h6>${inline(m[1])}</h6>`);
    else if ((m = line.match(/^#####\s+(.*)$/))) out.push(`<h5>${inline(m[1])}</h5>`);
    else if ((m = line.match(/^####\s+(.*)$/))) out.push(`<h4>${inline(m[1])}</h4>`);
    else if ((m = line.match(/^###\s+(.*)$/))) out.push(`<h3>${inline(m[1])}</h3>`);
    else if ((m = line.match(/^##\s+(.*)$/))) out.push(`<h2>${inline(m[1])}</h2>`);
    else if ((m = line.match(/^#\s+(.*)$/))) out.push(`<h1>${inline(m[1])}</h1>`);
    else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');

  function inline(s: string): string {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      );
  }
}
