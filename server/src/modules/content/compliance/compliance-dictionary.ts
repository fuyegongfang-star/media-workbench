/**
 * T3.11 合规预审内置词典（纯数据，无副作用）。
 * 与 Prisma/网络无关，便于单测与被 compliance.util / compliance.service 复用。
 *
 * 设计要点：
 * - category：absolute（广告法绝对化用语）/ sensitive（敏感/违禁词）。
 * - severity：
 *   - blocking：硬卡点。命中即阻断「送审」（除非显式 override），对应广告法第九条明确禁止的绝对化用语与违禁承诺。
 *   - warning：提示级。命中仅「标红」提示，不阻断送审（如较常见、语境依赖的超级lative）。
 * 词典为离线、确定性来源，保证送审前预审始终可用（区别于依赖外部 LLM 的朱雀检测）。
 */

export type ComplianceCategory = 'absolute' | 'sensitive';
export type ComplianceSeverity = 'blocking' | 'warning';

export interface ComplianceWord {
  /** 待检测的词语（子串匹配，大小写不敏感）。 */
  word: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  /** 命中后的修改建议（供前端标红提示展示）。 */
  suggestion?: string;
}

/** 词典版本号，随词表演进递增，写入每条 ComplianceCheck 便于追溯。 */
export const DICTIONARY_VERSION = '1';

/**
 * 默认合规词典。
 * 注意：此处为「预审辅助」词表，不替代法务终审；命中 blocking 词仅作送审硬卡点提示。
 */
export function defaultComplianceDictionary(): ComplianceWord[] {
  return [
    // ===== 广告法绝对化用语（blocking：明确违法，送审硬卡点）=====
    { word: '国家级', category: 'absolute', severity: 'blocking', suggestion: '广告法第九条禁止「国家级」等绝对化用语，建议删除或改为客观描述' },
    { word: '最高级', category: 'absolute', severity: 'blocking', suggestion: '「最高级」属绝对化用语，建议删除或限定具体维度' },
    { word: '最佳', category: 'absolute', severity: 'blocking', suggestion: '「最佳」属绝对化用语，建议改为「优选」「口碑较好」等' },
    { word: '顶级', category: 'absolute', severity: 'blocking', suggestion: '「顶级」属绝对化用语，建议删除或量化说明' },
    { word: '极品', category: 'absolute', severity: 'blocking', suggestion: '「极品」属绝对化用语，建议删除' },
    { word: '极致', category: 'absolute', severity: 'blocking', suggestion: '「极致」易被认定为绝对化用语，建议弱化表述' },
    { word: '绝无仅有', category: 'absolute', severity: 'blocking', suggestion: '「绝无仅有」属绝对化用语，建议删除' },
    { word: '空前绝后', category: 'absolute', severity: 'blocking', suggestion: '「空前绝后」属绝对化用语，建议删除' },
    { word: '独一无二', category: 'absolute', severity: 'blocking', suggestion: '「独一无二」属绝对化用语，建议改为「特色鲜明」等' },
    { word: '唯一', category: 'absolute', severity: 'blocking', suggestion: '「唯一」属绝对化用语，除非有充分依据，否则建议删除' },
    { word: '第一品牌', category: 'absolute', severity: 'blocking', suggestion: '「第一品牌」属绝对化用语，建议删除或提供依据' },
    { word: '首创', category: 'absolute', severity: 'blocking', suggestion: '「首创」属绝对化用语，建议改为「率先推出」等可验证表述' },
    { word: '首个', category: 'absolute', severity: 'blocking', suggestion: '「首个」需可验证，否则建议弱化' },
    { word: '独家', category: 'absolute', severity: 'blocking', suggestion: '「独家」需有授权依据，否则建议删除' },
    { word: '万能', category: 'absolute', severity: 'blocking', suggestion: '「万能」属绝对化用语，建议删除' },
    { word: '100%', category: 'absolute', severity: 'blocking', suggestion: '「100%」等绝对化数据需可验证，否则建议给出区间或依据' },
    { word: '百分百', category: 'absolute', severity: 'blocking', suggestion: '「百分百」属绝对化用语，建议给出可验证依据' },
    { word: '世界领先', category: 'absolute', severity: 'blocking', suggestion: '「世界领先」属绝对化用语，建议量化或删除' },
    { word: '全球领先', category: 'absolute', severity: 'blocking', suggestion: '「全球领先」属绝对化用语，建议量化或删除' },
    { word: '全国首家', category: 'absolute', severity: 'blocking', suggestion: '「全国首家」需可验证，否则建议删除' },
    { word: '销量第一', category: 'absolute', severity: 'blocking', suggestion: '「销量第一」需有权威数据支撑，否则建议删除' },
    { word: '排名第一', category: 'absolute', severity: 'blocking', suggestion: '「排名第一」需注明排名来源与时间，否则建议删除' },
    { word: '领导者', category: 'absolute', severity: 'blocking', suggestion: '「领导者」属绝对化用语，建议改为「行业参与者」等' },
    { word: '领导品牌', category: 'absolute', severity: 'blocking', suggestion: '「领导品牌」属绝对化用语，建议删除' },
    { word: '王牌', category: 'absolute', severity: 'blocking', suggestion: '「王牌」属绝对化用语，建议弱化' },
    { word: '金牌', category: 'absolute', severity: 'blocking', suggestion: '「金牌」属绝对化用语，建议弱化' },
    { word: '至尊', category: 'absolute', severity: 'blocking', suggestion: '「至尊」属绝对化用语，建议删除' },
    { word: '巅峰', category: 'absolute', severity: 'blocking', suggestion: '「巅峰」属绝对化用语，建议弱化' },
    { word: '最先进', category: 'absolute', severity: 'blocking', suggestion: '「最先进」属绝对化用语，建议量化对比' },
    { word: '最优秀', category: 'absolute', severity: 'blocking', suggestion: '「最优秀」属绝对化用语，建议删除' },
    { word: '最顶级', category: 'absolute', severity: 'blocking', suggestion: '「最顶级」属绝对化用语，建议删除' },
    { word: '首选', category: 'absolute', severity: 'blocking', suggestion: '「首选」属绝对化用语，建议改为「推荐选择」等' },
    { word: '永久', category: 'absolute', severity: 'blocking', suggestion: '「永久」「终身」等承诺需谨慎，建议给出具体期限' },
    { word: '终身', category: 'absolute', severity: 'blocking', suggestion: '「终身」承诺需谨慎，建议给出具体期限与条件' },
    { word: '包治', category: 'absolute', severity: 'blocking', suggestion: '医疗类「包治」「根治」等承诺违法，建议删除' },
    { word: '根治', category: 'absolute', severity: 'blocking', suggestion: '医疗类「根治」等承诺违法，建议删除' },
    { word: '药到病除', category: 'absolute', severity: 'blocking', suggestion: '医疗类疗效承诺违法，建议删除' },
    { word: '无效退款', category: 'absolute', severity: 'blocking', suggestion: '「无效退款」等承诺需有依据，建议谨慎表述' },
    { word: '免费领取', category: 'absolute', severity: 'blocking', suggestion: '「免费领取」等诱导用语需合规，建议核实活动真实性' },
    { word: '立即见效', category: 'absolute', severity: 'blocking', suggestion: '「立即见效」等疗效/效果承诺需谨慎，建议删除' },

    // ===== 广告法绝对化用语（warning：常见、语境依赖，仅标红提示不阻断）=====
    { word: '最大', category: 'absolute', severity: 'warning', suggestion: '「最大」需可验证（如最大口径/最大容量），否则建议量化说明' },
    { word: '最小', category: 'absolute', severity: 'warning', suggestion: '「最小」需可验证，建议量化说明' },
    { word: '最高', category: 'absolute', severity: 'warning', suggestion: '「最高」需限定维度（如最高时速），建议量化说明' },
    { word: '最低', category: 'absolute', severity: 'warning', suggestion: '「最低」需可验证（如最低价保障），建议量化说明' },
    { word: '最新', category: 'absolute', severity: 'warning', suggestion: '「最新」需说明时间基准，建议给出具体版本/日期' },
    { word: '最全', category: 'absolute', severity: 'warning', suggestion: '「最全」需可验证，建议改为「品类丰富」等' },
    { word: '最强', category: 'absolute', severity: 'warning', suggestion: '「最强」属绝对化倾向，建议量化对比' },

    // ===== 敏感/违禁词（sensitive）=====
    { word: '赌博', category: 'sensitive', severity: 'blocking', suggestion: '涉赌内容违规，建议删除' },
    { word: '私彩', category: 'sensitive', severity: 'blocking', suggestion: '私彩/地下彩票属违规，建议删除' },
    { word: '代开发票', category: 'sensitive', severity: 'blocking', suggestion: '代开发票属违规，建议删除' },
    { word: '办证', category: 'sensitive', severity: 'warning', suggestion: '「办证」等表述易涉违规广告，建议核实并谨慎表述' },
    { word: '一键转发', category: 'sensitive', severity: 'warning', suggestion: '涉诱导分享/裂变表述需合规，建议核实平台规则' },
  ];
}
