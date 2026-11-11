// ============ 平台模板预留位（T5.2）============
// 内容项目与提示词模板均按 platform 区分。此处集中预留各内容平台占位，
// 新增平台只需在此登记即可（ContentProject.platform / PromptTemplate.platform 已就绪），
// 无需改动 schema。当前默认 wechat，其余为「预留位」，待后续接入各平台接口/模板。

export const SUPPORTED_PLATFORMS = ['wechat', 'xiaohongshu', 'douyin', 'toutiao'] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export const DEFAULT_PLATFORM: Platform = 'wechat';

export const PLATFORM_LABELS: Record<Platform, string> = {
  wechat: '微信公众号',
  xiaohongshu: '小红书',
  douyin: '抖音',
  toutiao: '今日头条',
};

/** 校验平台是否受支持；非法返回 null（调用方回落默认平台）。 */
export function resolvePlatform(value?: string | null): Platform {
  if (value && (SUPPORTED_PLATFORMS as readonly string[]).includes(value)) {
    return value as Platform;
  }
  return DEFAULT_PLATFORM;
}
