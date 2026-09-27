export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // ==========================================
  // 1. 防盗链 (Referer 白名单校验)
  // ==========================================
  const referer = req.headers.get('referer') || req.headers.get('origin') || '';
  
  // 允许的根域名列表
  const allowedDomains = [
    'o3.hk', 
    'shingyu.cn', 
    'chouyou.org', 
    'hoshisumi.com',
    'localhost',
    '127.0.0.1'
  ];
  
  // 如果存在 referer，则进行精确校验
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const hostname = refererUrl.hostname;
      
      // 校验逻辑：域名完全匹配，或者是允许域名的子域名 (例如 www.o3.hk 匹配 o3.hk)
      const isAllowed = allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        return new Response('403 Forbidden: 您的域名不在访问白名单中', { status: 403 });
      }
    } catch (e) {
      // referer 格式错误时不予放行
      return new Response('403 Forbidden: Invalid Referer', { status: 403 });
    }
  }
  // 注：此处默认放行了空 Referer（直接在浏览器地址栏打开）。
  // 如果需要极其严格的防盗链，可以加上 if (!referer) return 403;

  // ==========================================
  // 2. 构建目标请求 (获取 Google CSS)
  // ==========================================
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, 'https://fonts.googleapis.com');

  const headers = new Headers();
  // 【关键】必须透传 User-Agent，Google 会根据 UA 下发不同格式的字体链接
  const ua = req.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);

  const response = await fetch(targetUrl.toString(), { headers });

  if (!response.ok) {
    return new Response(response.body, { status: response.status });
  }

  // ==========================================
  // 3. 域名替换与响应头设置
  // ==========================================
  let css = await response.text();
  
  // 将原版 gstatic 字体域名无脑替换为您配置好的纯 CDN 域名 2
  const FONT_CDN_DOMAIN = 'https://fonts-file.o3.hk';
  css = css.replace(/https:\/\/fonts\.gstatic\.com/g, FONT_CDN_DOMAIN);

  const resHeaders = new Headers(response.headers);
  // 清理可能导致乱码的压缩头，Vercel 节点会自动重新处理
  resHeaders.delete('content-encoding');
  resHeaders.delete('content-length');
  
  // 跨域允许
  resHeaders.set('access-control-allow-origin', '*');
  
  // 【最佳实践缓存策略】
  // private: 禁止任何 CDN 节点缓存，防止 A 浏览器的 CSS 污染 B 浏览器
  // max-age=86400: 允许用户的浏览器本地强缓存 1 天，加快二次访问速度
  resHeaders.set('cache-control', 'private, max-age=86400');

  return new Response(css, {
    status: 200,
    headers: resHeaders,
  });
}