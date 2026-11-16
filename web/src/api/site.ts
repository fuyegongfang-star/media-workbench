/**
 * 公开站点元信息（T6.7）：TDK / Logo / SEO·GEO / 页脚配置。
 *
 * 两个职责：
 * 1. 拉取 GET /api/system/public（公开端点，未登录可用），全局共享 siteInfo；
 * 2. 在运行时把配置写进 <head>（title / meta / canonical / favicon / JSON-LD）。
 *
 * 安全：所有文本通过 setAttribute / textContent 写入，不拼接 HTML；
 * URL 只允许 http(s) 与站内绝对路径，杜绝 javascript: / data: 注入。
 * 静态 index.html 已内置一份基线，爬虫不执行 JS 时也能读到完整 TDK。
 */
import { ref } from 'vue';

export interface SiteSeoConfig {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  canonicalUrl: string;
  ogImageUrl: string;
  indexable: boolean;
  logoUrl: string;
  logoAlt: string;
  geoSummary: string;
  llmsEnabled: boolean;
  ownerName: string;
  ownerUrl: string;
  supportEmail: string;
  icpNumber: string;
  icpUrl: string;
  policeRecord: string;
  policeUrl: string;
  copyrightNote: string;
}

export const DEFAULT_SEO: SiteSeoConfig = {
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '自媒体工作台,选题雷达,内容生产流水线,私有部署',
  canonicalUrl: '',
  ogImageUrl: '',
  indexable: true,
  logoUrl: '',
  logoAlt: '',
  geoSummary:
    '自媒体工作台是一套可私有部署的内容生产系统，覆盖选题雷达采集赛道热点、对标拆解沉淀策略、AI 起草与合规预审、发布归档与效果成本复盘。全部数据存放在自有数据库，凭据加密入库。',
  llmsEnabled: true,
  ownerName: '',
  ownerUrl: '',
  supportEmail: '',
  icpNumber: '',
  icpUrl: '',
  policeRecord: '',
  policeUrl: '',
  copyrightNote: '',
};

export interface PublicSiteView {
  siteName: string;
  siteDesc: string | null;
  seo: SiteSeoConfig;
  updatedAt: string | null;
}

export const DEFAULT_PUBLIC_SITE: PublicSiteView = {
  siteName: '自媒体工作台',
  siteDesc: null,
  seo: { ...DEFAULT_SEO },
  updatedAt: null,
};

/** 全局响应式站点信息：首页 / 认证页 / 布局均可直接读取，加载完成后自动刷新。 */
export const siteInfo = ref<PublicSiteView>({ ...DEFAULT_PUBLIC_SITE, seo: { ...DEFAULT_SEO } });

const FALLBACK_DESC =
  '把选题到发布收进一条流水线：热点雷达、对标拆解、AI 起草与合规预审、发布归档、效果与成本复盘。私有部署，数据自持。';

function apiPrefix(): string {
  return import.meta.env.VITE_API_PREFIX ?? 'api';
}

/** 只允许 http(s) 绝对地址与站内 /path；其余一律返回空串。 */
export function safeUrl(value: string | null | undefined): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  return '';
}

export function safeMailto(email: string | null | undefined): string {
  const s = (email ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? `mailto:${s}` : '';
}

/** 把站内路径补成绝对地址（用于 og:url / og:image）。 */
export function absoluteUrl(value: string, base: string): string {
  const s = safeUrl(value);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return base.replace(/\/+$/, '') + s;
}

function setMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(data: Record<string, unknown> | null): void {
  let el = document.getElementById('site-jsonld');
  if (!data) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.id = 'site-jsonld';
    el.setAttribute('type', 'application/ld+json');
    document.head.appendChild(el);
  }
  // textContent 而非 innerHTML：配置内容永远不会被当作标记解析。
  el.textContent = JSON.stringify(data);
}

/**
 * 按当前站点配置刷新 <head>。首页额外输出 canonical 与 SoftwareApplication 结构化数据；
 * 内页只保留站点级 title / description，避免重复 canonical 造成 SEO 冲突。
 */
export function applyHead(): void {
  if (typeof document === 'undefined') return;
  const { siteName, siteDesc, seo } = siteInfo.value;
  const name = siteName.trim() || '自媒体工作台';
  const isHome = location.pathname === '/' || location.pathname === '';
  const description = seo.seoDescription.trim() || siteDesc?.trim() || FALLBACK_DESC;
  const title = isHome ? seo.seoTitle.trim() || name : `${name} · 工作台`;
  const base = /^https?:\/\//i.test(seo.canonicalUrl) ? seo.canonicalUrl : location.origin;

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'keywords', seo.seoKeywords.trim() || DEFAULT_SEO.seoKeywords);
  setMeta('name', 'robots', seo.indexable ? 'index,follow' : 'noindex,nofollow');
  setMeta('name', 'author', seo.ownerName.trim() || name);
  setMeta('name', 'theme-color', '#2f6fed');
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', name);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', base.replace(/\/+$/, '') + '/');
  setMeta('property', 'og:locale', 'zh_CN');
  setMeta(
    'property',
    'og:image',
    absoluteUrl(seo.ogImageUrl, base) || absoluteUrl('/og-cover.svg', base),
  );

  setLink('canonical', isHome ? base.replace(/\/+$/, '') + '/' : '');
  setLink('icon', safeUrl(seo.logoUrl) || '/favicon.svg');
  // llms.txt 为静态文件；关闭 AI 摘要时仅移除发现链接与 JSON-LD 摘要，不伪造不存在的开关。
  setLink('alternate', seo.llmsEnabled ? '/llms.txt' : '');

  if (!isHome) {
    setJsonLd(null);
    return;
  }
  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    ...(seo.llmsEnabled && seo.geoSummary.trim()
      ? { disambiguatingDescription: seo.geoSummary.trim() }
      : {}),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'zh-CN',
    url: base.replace(/\/+$/, '') + '/',
    author: { '@type': 'Organization', name: seo.ownerName.trim() || name },
    license: 'https://opensource.org/licenses/MIT',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
  });
}

/** 拉取公开站点配置；失败时保留静态基线，不阻断首页渲染。 */
export async function loadSiteInfo(timeoutMs = 5000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/${apiPrefix()}/system/public`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const view = (await res.json()) as Partial<PublicSiteView>;
      siteInfo.value = {
        siteName: view.siteName?.trim() || DEFAULT_PUBLIC_SITE.siteName,
        siteDesc: typeof view.siteDesc === 'string' ? view.siteDesc : null,
        seo: { ...DEFAULT_SEO, ...(view.seo ?? {}) },
        updatedAt: view.updatedAt ?? null,
      };
    }
  } catch {
    /* 离线 / API 未就绪：沿用 index.html 静态基线 */
  } finally {
    clearTimeout(timer);
    applyHead();
  }
}
