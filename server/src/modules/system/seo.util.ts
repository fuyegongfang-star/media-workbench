/**
 * 站点品牌 / TDK / SEO·GEO 配置纯函数（T6.7，不依赖数据库，可单测）。
 *
 * 安全约定：这些值最终会写进公开首页的 <title> / <meta> / <link rel=canonical> /
 * <link rel=icon> / <img src> / <a href> 与 JSON-LD。因此这里按字段白名单清洗：
 * - 文本：去控制字符、trim、按长度截断（前端用 setAttribute / textContent 写入，不会被当成 HTML 解析）。
 * - URL：只允许 http(s):// 与站内绝对路径 /xxx（拒绝 //、javascript:、data: 等协议）。
 * - 邮箱：仅接受最简合法格式，否则丢弃（避免拼出 javascript: 之类的 mailto）。
 * - 布尔：只接受真正的 boolean。
 * 未知字段一律忽略，避免异常 Json 污染配置。
 */

export interface SiteSeoConfig {
  /** TDK：留空时分别回落到站点名称 / 站点描述。 */
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  /** 站点主域名（含协议），用于 canonical / og:url / JSON-LD url；留空时按浏览器 origin 推导。 */
  canonicalUrl: string;
  ogImageUrl: string;
  /** 是否允许搜索引擎收录；false 时输出 noindex,nofollow。私有部署可按需关闭。 */
  indexable: boolean;
  /** Logo 图片地址（http(s) 或站内 /path），留空使用内置 SVG 品牌标。 */
  logoUrl: string;
  logoAlt: string;
  /** GEO：给生成式引擎 / AI 搜索的一段客观站点摘要，写入 JSON-LD 与 meta。 */
  geoSummary: string;
  /** 是否对外输出 AI 摘要（关闭后仅保留基础 TDK，不含 geoSummary）。 */
  llmsEnabled: boolean;
  /** 页脚：所有者 / 运营者、站点主页、联系邮箱、备案与附加版权说明。 */
  ownerName: string;
  ownerUrl: string;
  supportEmail: string;
  icpNumber: string;
  icpUrl: string;
  policeRecord: string;
  policeUrl: string;
  copyrightNote: string;
  /** 公开首页文案：正式投运站点可自行改写，不再出现「演示 / 静态介绍 / 私有部署实例」等固定措辞。 */
  homeEyebrow: string;
  homeMetaLine: string;
  privacyTitle: string;
  privacyLead: string;
  footerNote: string;
  /** 留空则不展示；由站点所有者按实际部署形态填写。 */
  deploymentLabel: string;
  /** 版权栏补充声明，留空则不展示。 */
  footerDisclaimer: string;
}

export const DEFAULT_SEO: SiteSeoConfig = {
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '自媒体工作台,选题雷达,内容生产流水线,内容运营',
  canonicalUrl: '',
  ogImageUrl: '',
  indexable: true,
  logoUrl: '',
  logoAlt: '',
  geoSummary:
    '自媒体工作台是一套面向内容团队的工作台系统，覆盖选题雷达采集赛道热点、对标拆解沉淀策略、AI 起草与合规预审、发布归档与效果成本复盘。全部数据存放在自有数据库，凭据加密入库。',
  llmsEnabled: true,
  ownerName: '',
  ownerUrl: '',
  supportEmail: '',
  icpNumber: '',
  icpUrl: '',
  policeRecord: '',
  policeUrl: '',
  copyrightNote: '',
  homeEyebrow: '内容生产中枢 · 全流程留痕',
  homeMetaLine: '选题 · 拆解 · 起草 · 审核 · 发布 · 复盘，一站完成',
  privacyTitle: '隐私与数据',
  privacyLead: '我们重视数据安全与合规。业务数据仅在授权账号登录后可见，公开页面不承载任何业务数据。',
  footerNote: '页面信息由站点所有者维护，保留所有权利。',
  deploymentLabel: '',
  footerDisclaimer: '',
};

type FieldKind = 'text' | 'url' | 'email' | 'bool';
interface FieldSpec {
  kind: FieldKind;
  max: number;
}

/** 字段白名单 + 长度上限；前端 maxlength 与此保持一致。 */
export const SEO_FIELDS: Record<keyof SiteSeoConfig, FieldSpec> = {
  seoTitle: { kind: 'text', max: 120 },
  seoDescription: { kind: 'text', max: 300 },
  seoKeywords: { kind: 'text', max: 300 },
  canonicalUrl: { kind: 'url', max: 300 },
  ogImageUrl: { kind: 'url', max: 300 },
  indexable: { kind: 'bool', max: 0 },
  logoUrl: { kind: 'url', max: 300 },
  logoAlt: { kind: 'text', max: 80 },
  geoSummary: { kind: 'text', max: 600 },
  llmsEnabled: { kind: 'bool', max: 0 },
  ownerName: { kind: 'text', max: 80 },
  ownerUrl: { kind: 'url', max: 300 },
  supportEmail: { kind: 'email', max: 120 },
  icpNumber: { kind: 'text', max: 60 },
  icpUrl: { kind: 'url', max: 300 },
  policeRecord: { kind: 'text', max: 60 },
  policeUrl: { kind: 'url', max: 300 },
  copyrightNote: { kind: 'text', max: 160 },
  homeEyebrow: { kind: 'text', max: 80 },
  homeMetaLine: { kind: 'text', max: 160 },
  privacyTitle: { kind: 'text', max: 60 },
  privacyLead: { kind: 'text', max: 300 },
  footerNote: { kind: 'text', max: 300 },
  deploymentLabel: { kind: 'text', max: 120 },
  footerDisclaimer: { kind: 'text', max: 160 },
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // 去掉控制字符（含 \r \n），避免注入 meta 属性或伪造响应头。
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function cleanUrl(value: unknown, max: number): string {
  const s = cleanText(value, max);
  if (!s) return '';
  // 站内绝对路径允许以 / 开头，但拒绝 //host（协议相对 URL 可被用于外链注入）。
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  return '';
}

function cleanEmail(value: unknown, max: number): string {
  const s = cleanText(value, max);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function cleanField(spec: FieldSpec, value: unknown, fallback: string | boolean): string | boolean {
  if (spec.kind === 'bool') return typeof value === 'boolean' ? value : fallback;
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return fallback;
  const raw = cleanText(value, spec.max);
  if (raw === '') return ''; // 显式留空 = 清空 / 回落
  const cleaned =
    spec.kind === 'url'
      ? cleanUrl(value, spec.max)
      : spec.kind === 'email'
        ? cleanEmail(value, spec.max)
        : raw;
  // 非法值（如 javascript:）不覆盖已有合法值，避免误清配置。
  return cleaned === '' ? fallback : cleaned;
}

/**
 * 合并 SEO 配置：默认值 → 已存值 → 本次入参。
 * 只读取白名单字段并逐个清洗，返回完整 SiteSeoConfig（前端可直接渲染，无需判空）。
 */
export function mergeSeo(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): SiteSeoConfig {
  const out: Record<string, string | boolean> = { ...DEFAULT_SEO };
  for (const source of [existing, incoming]) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, spec] of Object.entries(SEO_FIELDS) as [keyof SiteSeoConfig, FieldSpec][]) {
      if (!(key in source)) continue;
      out[key] = cleanField(spec, source[key], out[key]);
    }
  }
  return out as unknown as SiteSeoConfig;
}

/** 公开端点 / 首页渲染用的兜底：去掉不该暴露的字段由调用方保证。 */
export function publicSeo(existing: Record<string, unknown> | null | undefined): SiteSeoConfig {
  return mergeSeo(existing, null);
}
