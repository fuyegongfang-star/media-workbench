import type { ChatMessage } from '../../generation/provider.contract';

// ============ 文章生成提示词与解析（T3.5）============
// 纯函数：渲染消息 + 解析 LLM 输出，不依赖数据库/LLM 密钥，可单测。

export type ArticleStage = 'draft' | 'continue' | 'rewrite' | 'compress' | 'expand';

// 各子动作的人类指令（注入 article_edit 模板 {{action}}）
export const ARTICLE_EDIT_ACTIONS: Record<Exclude<ArticleStage, 'draft'>, string> = {
  continue: '在现有正文基础上自然续写，保持语气与结构连贯，不要重复已有内容，不要提前收尾。',
  rewrite: '在不改变核心信息与观点的前提下重写全文，优化表达、逻辑与可读性，保持篇幅相近。',
  compress: '对正文做精简压缩，保留核心论点与关键信息，删除冗余表达与重复内容，篇幅明显缩短。',
  expand: '在现有正文基础上扩写，补充论据、案例、数据与细节，使内容更丰满可信，篇幅适度增加。',
};

const ARTICLE_DRAFT_SYSTEM =
  '你是一名资深公众号内容创作者，擅长基于账号策略与选题，产出结构清晰、可读性强、合规不夸大的原创长文（Markdown）。请直接输出正文，不要包含额外说明。';

export const DEFAULT_ARTICLE_DRAFT_USER_TEMPLATE = `请根据以下信息撰写一篇公众号长文（Markdown 格式，含小标题与分段）：

# 选题与标题
标题：{{title}}
标题依据：{{titleBasis}}

# 选题信息
选题：{{topicTitle}}
受众：{{topicAudience}}
切入角度：{{topicAngle}}
标签：{{topicTags}}

# 账号策略摘要
{{strategySummary}}

# 对标分析摘要
{{analysisSummary}}

要求：
- 开篇有钩子，结构清晰（痛点引入-观点展开-案例佐证-行动号召），结尾有落点；
- 语言符合账号调性，避免极限词与夸大诱导表述（合规）；
- 直接输出 Markdown 正文，不要包含 \`\`\` 代码块与额外解释。`;

const ARTICLE_EDIT_SYSTEM =
  '你是一名资深公众号内容编辑，擅长在保留作者原意与核心信息的前提下，按指定动作改写正文（Markdown）。请直接输出修改后的正文，不要包含额外说明。';

export const DEFAULT_ARTICLE_EDIT_USER_TEMPLATE = `当前文章标题：{{title}}

# 现有正文
{{currentContent}}

# 编辑指令
请执行以下动作：{{action}}

要求：
- 保持 Markdown 结构；
- 直接输出修改后的完整正文，不要包含 \`\`\` 代码块与额外解释；
- 不改变文章的核心主题与合规底线。`;

export interface ArticleContext {
  title: string;
  titleBasis: string | null;
  topicTitle: string;
  topicAudience: string | null;
  topicAngle: string | null;
  topicTags: string;
  strategySummary: string;
  analysisSummary: string;
  currentContent: string;
  action: string;
}

function safe(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/** 纯函数：渲染初稿消息（stage=draft）。模板缺省用内置兜底。 */
export function renderArticleDraftMessages(ctx: ArticleContext, template?: string): ChatMessage[] {
  const userTpl = template && template.trim() ? template : DEFAULT_ARTICLE_DRAFT_USER_TEMPLATE;
  const user = userTpl
    .replace(/\{\{\s*title\s*\}\}/g, safe(ctx.title))
    .replace(/\{\{\s*titleBasis\s*\}\}/g, safe(ctx.titleBasis, '（无）'))
    .replace(/\{\{\s*topicTitle\s*\}\}/g, safe(ctx.topicTitle, '（未指定）'))
    .replace(/\{\{\s*topicAudience\s*\}\}/g, safe(ctx.topicAudience, '（不限）'))
    .replace(/\{\{\s*topicAngle\s*\}\}/g, safe(ctx.topicAngle, '（未指定）'))
    .replace(/\{\{\s*topicTags\s*\}\}/g, safe(ctx.topicTags, '（无）'))
    .replace(/\{\{\s*strategySummary\s*\}\}/g, safe(ctx.strategySummary, '（暂无策略）'))
    .replace(/\{\{\s*analysisSummary\s*\}\}/g, safe(ctx.analysisSummary, '（暂无对标分析）'));
  return [
    { role: 'system', content: ARTICLE_DRAFT_SYSTEM },
    { role: 'user', content: user },
  ];
}

/** 纯函数：渲染编辑（续写/改写/压缩/扩写）消息。模板缺省用内置兜底。 */
export function renderArticleEditMessages(ctx: ArticleContext, template?: string): ChatMessage[] {
  const userTpl = template && template.trim() ? template : DEFAULT_ARTICLE_EDIT_USER_TEMPLATE;
  const user = userTpl
    .replace(/\{\{\s*title\s*\}\}/g, safe(ctx.title))
    .replace(/\{\{\s*currentContent\s*\}\}/g, safe(ctx.currentContent, '（正文为空）'))
    .replace(/\{\{\s*action\s*\}\}/g, safe(ctx.action, '按上下文合理改写'));
  return [
    { role: 'system', content: ARTICLE_EDIT_SYSTEM },
    { role: 'user', content: user },
  ];
}

/** 纯函数：从 LLM 文本稳健抽取正文：去除 ```markdown / ``` 围栏，trim；不做语义判断（空由调用方决定）。 */
export function parseArticleText(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  const fence = s.match(/```(?:markdown|md)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  return s;
}
