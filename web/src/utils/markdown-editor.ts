/**
 * 正文编辑器纯逻辑：Markdown 工具栏命令、安全预览、剪贴板转换、排版模板。
 * 不依赖 Vue / DOM，便于用 Node test 直接回归（node --experimental-strip-types）。
 */

export type MdCommand =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'quote'
  | 'code'
  | 'inlineCode'
  | 'link'
  | 'ul'
  | 'ol'
  | 'table'
  | 'hr'
  | 'image';

export interface MdEditResult {
  text: string;
  start: number;
  end: number;
}

export interface FormatTemplate {
  id: string;
  name: string;
  desc: string;
  body: string;
  builtin: boolean;
  /** global = 全局；其他值 = 归属账号名 */
  scope: string;
}

interface Selection {
  s: number;
  e: number;
  selected: string;
}

function normalizeSelection(text: string, start: number, end: number): Selection {
  const s = Math.max(0, Math.min(start ?? 0, text.length));
  const e = Math.max(s, Math.min(end ?? s, text.length));
  return { s, e, selected: text.slice(s, e) };
}

/** 在光标处插入整块内容，自动补空行，返回插入后的正文与光标区间。 */
export function insertBlock(text: string, start: number, end: number, block: string): MdEditResult {
  const { s, e } = normalizeSelection(text, start, end);
  const before = text.slice(0, s);
  const after = text.slice(e);
  let gapBefore = '';
  if (before && !before.endsWith('\n\n')) gapBefore = before.endsWith('\n') ? '\n' : '\n\n';
  let gapAfter = '';
  if (after && !after.startsWith('\n\n')) gapAfter = after.startsWith('\n') ? '\n' : '\n\n';
  const insertion = gapBefore + block + gapAfter;
  return {
    text: before + insertion + after,
    start: s + gapBefore.length,
    end: s + gapBefore.length + block.length,
  };
}

function togglePrefix(
  lines: string[],
  pattern: RegExp,
  prefix: string | ((index: number) => string),
): string[] {
  const allMatched = lines.length > 0 && lines.every((line) => pattern.test(line));
  return lines.map((line, index) => {
    const plain = line.replace(pattern, '');
    const p = typeof prefix === 'function' ? prefix(index) : prefix;
    return allMatched ? plain : p + plain;
  });
}

/** 工具栏命令：统一返回新正文 + 新的选区，由调用方写回 textarea。 */
export function applyMdCommand(
  text: string,
  start: number,
  end: number,
  cmd: MdCommand,
): MdEditResult {
  const { s, e, selected } = normalizeSelection(text, start, end);

  const wrap = (before: string, after: string, placeholder: string): MdEditResult => {
    const inner = selected || placeholder;
    return {
      text: text.slice(0, s) + before + inner + after + text.slice(e),
      start: s + before.length,
      end: s + before.length + inner.length,
    };
  };

  const lineEdit = (transform: (lines: string[]) => string[]): MdEditResult => {
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = text.indexOf('\n', e);
    if (lineEnd === -1) lineEnd = text.length;
    const head = text.slice(0, lineStart);
    const tail = text.slice(lineEnd);
    const oldBlock = text.slice(lineStart, lineEnd);
    const newBlock = transform(oldBlock.split('\n')).join('\n');
    return {
      text: head + newBlock + tail,
      start: lineStart,
      end: lineStart + newBlock.length,
    };
  };

  switch (cmd) {
    case 'h1':
      return lineEdit((lines) =>
        lines.length === 1 && !lines[0].trim()
          ? ['# 一级标题']
          : togglePrefix(lines, /^#{1,6}\s+/, () => '# '),
      );
    case 'h2':
      return lineEdit((lines) =>
        lines.length === 1 && !lines[0].trim()
          ? ['## 二级标题']
          : togglePrefix(lines, /^#{1,6}\s+/, () => '## '),
      );
    case 'h3':
      return lineEdit((lines) =>
        lines.length === 1 && !lines[0].trim()
          ? ['### 三级标题']
          : togglePrefix(lines, /^#{1,6}\s+/, () => '### '),
      );
    case 'bold':
      return wrap('**', '**', '加粗文字');
    case 'italic':
      return wrap('*', '*', '斜体文字');
    case 'strike':
      return wrap('~~', '~~', '删除线文字');
    case 'quote':
      return lineEdit((lines) => togglePrefix(lines, /^>\s?/, '> '));
    case 'ul':
      return lineEdit((lines) => togglePrefix(lines, /^[-*]\s+/, '- '));
    case 'ol':
      return lineEdit((lines) => togglePrefix(lines, /^\d+\.\s+/, (i) => `${i + 1}. `));
    case 'inlineCode':
      return wrap('`', '`', '代码');
    case 'code': {
      const block = '```\n' + (selected || '在这里粘贴代码') + '\n```';
      return insertBlock(text, s, e, block);
    }
    case 'link': {
      const label = selected || '链接文字';
      const before = '[' + label + '](https://)';
      const urlStart = s + 1 + label.length + 2;
      return {
        text: text.slice(0, s) + before + text.slice(e),
        start: urlStart,
        end: urlStart + 8,
      };
    }
    case 'image': {
      const label = selected || '图片说明';
      const before = '![' + label + '](https://)';
      const urlStart = s + 2 + label.length + 2;
      return {
        text: text.slice(0, s) + before + text.slice(e),
        start: urlStart,
        end: urlStart + 8,
      };
    }
    case 'table':
      return insertBlock(
        text,
        s,
        e,
        '| 维度 | 说明 |\n| --- | --- |\n|  |  |',
      );
    case 'hr':
      return insertBlock(text, s, e, '---');
    default:
      return { text, start: s, end: e };
  }
}

/** 先转义 HTML，再套基础 Markdown，避免正文里的标签变成可执行 HTML。 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function inlineMd(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    '<img src="$2" alt="$1" />',
  );
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
  t = t.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/`([^`]+?)`/g, '<code>$1</code>');
  return t;
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

/** 安全轻量预览：标题 / 段落 / 引用 / 有序无序列表 / 表格 / 代码 / 分割线。 */
export function renderMarkdown(src: string): string {
  if (!src) return '<p class="empty">（空）</p>';
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) {
      if (inCode) {
        html += '</code></pre>';
        inCode = false;
      } else {
        closeList();
        html += '<pre><code>';
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html += escapeHtml(raw) + '\n';
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      closeList();
      html += '<hr />';
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html += `<h${level}>${inlineMd(h[2])}</h${level}>`;
      continue;
    }
    const q = raw.match(/^\s*>\s?(.*)$/);
    if (q) {
      closeList();
      html += `<blockquote>${inlineMd(q[1])}</blockquote>`;
      continue;
    }
    const ul = raw.match(/^\s*[-*]\s+(.*)$/);
    const ol = raw.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const wanted = ul ? 'ul' : 'ol';
      if (listType !== wanted) {
        closeList();
        html += `<${wanted}>`;
        listType = wanted;
      }
      html += `<li>${inlineMd((ul || ol)![1])}</li>`;
      continue;
    }
    if (raw.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      closeList();
      const head = splitTableRow(raw);
      i += 1; // 跳过分隔行
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        i += 1;
        rows.push(splitTableRow(lines[i]));
      }
      html += '<table><thead><tr>' + head.map((cell) => `<th>${inlineMd(cell)}</th>`).join('') + '</tr></thead>';
      if (rows.length) {
        html +=
          '<tbody>' +
          rows
            .map(
              (row) =>
                '<tr>' +
                head.map((_, idx) => `<td>${inlineMd(row[idx] ?? '')}</td>`).join('') +
                '</tr>',
            )
            .join('') +
          '</tbody>';
      }
      html += '</table>';
      continue;
    }
    if (!raw.trim()) {
      closeList();
      continue;
    }
    closeList();
    html += `<p>${inlineMd(raw)}</p>`;
  }
  if (inCode) html += '</code></pre>';
  closeList();
  return html;
}

/** 复制为纯文本：去掉 Markdown 记号，保留段落与换行。 */
export function markdownToPlain(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/^\s*\|.*\|\s*$/gm, (line) =>
      splitTableRow(line)
        .filter((cell) => !/^:?-{2,}:?$/.test(cell))
        .join('  '),
    )
    .trim();
}

/** 富文本复制：给预览 HTML 补内联样式，便于直接粘进公众号/邮箱等富文本编辑器。 */
export function richHtmlForClipboard(src: string): string {
  const sizes = ['24px', '21px', '19px', '17px', '16px', '15px'];
  const styled = src
    .replace(/<h([1-6])>/g, (_m, n: string) =>
      `<h${n} style="font-size:${sizes[Number(n) - 1]};font-weight:700;margin:18px 0 10px;line-height:1.4;">`,
    )
    .replace(/<p>/g, '<p style="margin:10px 0;line-height:1.8;">')
    .replace(/<blockquote>/g, '<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #888;color:#555;">')
    .replace(/<ul>/g, '<ul style="margin:10px 0;padding-left:22px;">')
    .replace(/<ol>/g, '<ol style="margin:10px 0;padding-left:22px;">')
    .replace(/<li>/g, '<li style="margin:4px 0;line-height:1.8;">')
    .replace(/<code>/g, '<code style="background:#f2f2f2;padding:1px 4px;border-radius:3px;">')
    .replace(/<strong>/g, '<strong style="font-weight:700;">')
    .replace(/<del>/g, '<del style="color:#999;">')
    .replace(/<a /g, '<a style="color:#1677ff;" ')
    .replace(/<hr\s*\/?>/g, '<hr style="border:none;border-top:1px solid #ddd;margin:18px 0;" />')
    .replace(/<img /g, '<img style="max-width:100%;height:auto;" ');
  return (
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;font-size:16px;line-height:1.8;color:#222;">' +
    styled +
    '</div>'
  );
}

export const BUILTIN_TEMPLATES: FormatTemplate[] = [
  {
    id: 'deep',
    name: '公众号深度长文',
    desc: '导读 + 正文 + 结语，适合观点/行业分析类长文',
    scope: 'global',
    builtin: true,
    body:
      '# {{title}}\n\n' +
      '> **导读**｜{{date}} · {{account}}\n> 一句话说清：读者看完能带走什么。\n\n' +
      '{{body}}\n\n' +
      '---\n\n' +
      '**写在最后**：以上是个人观察，欢迎在评论区聊聊你的看法。',
  },
  {
    id: 'news',
    name: '热点快讯',
    desc: '导语 + 三条速览 + 正文 + 信息源，适合追热点',
    scope: 'global',
    builtin: true,
    body:
      '# {{title}}\n\n' +
      '**编辑导语**：（30 字内讲清事件）\n\n' +
      '## 三条速览\n1. \n2. \n3. \n\n' +
      '{{body}}\n\n' +
      '> **信息源**：列出 1–3 个可核查来源，注明发布时间。',
  },
  {
    id: 'review',
    name: '测评种草',
    desc: '结论先行 + 正文 + 优缺点表格 + 购买建议',
    scope: 'global',
    builtin: true,
    body:
      '# {{title}}\n\n' +
      '> 适合谁看：（人群 + 使用场景）\n\n' +
      '## 先看结论\n（推荐 / 不推荐 + 一句话理由。）\n\n' +
      '{{body}}\n\n' +
      '## 优点 / 不足\n| 维度 | 表现 | 说明 |\n| --- | --- | --- |\n| 优点 | | |\n| 不足 | | |\n\n' +
      '## 购买建议\n（给出明确结论与替代选项。）',
  },
  {
    id: 'opinion',
    name: '观点评论',
    desc: '争议焦点 + 正文 + 反方回应 + 明确结论',
    scope: 'global',
    builtin: true,
    body:
      '# {{title}}\n\n' +
      '> 争议焦点：（一句话概括分歧）\n\n' +
      '{{body}}\n\n' +
      '## 反方观点回应\n（先复述对方最强论点，再逐条回应。）\n\n' +
      '## 我的结论\n（亮明立场，给出可执行的建议。）',
  },
  {
    id: 'tutorial',
    name: '教程步骤',
    desc: '适用环境 + 准备 + 正文 + 常见问题 + 小结',
    scope: 'global',
    builtin: true,
    body:
      '# {{title}}\n\n' +
      '> 适用环境：（系统 / 工具版本）　预计耗时：（xx 分钟）\n\n' +
      '## 准备工作\n- \n- \n\n' +
      '{{body}}\n\n' +
      '## 常见问题\n**Q1：**　**A：**\n\n' +
      '## 小结',
  },
  {
    id: 'checklist',
    name: '清单干货',
    desc: '收藏引导 + 正文 + 使用方法，适合列表型内容',
    scope: 'global',
    builtin: true,
    body:
      '# {{title}}\n\n' +
      '> 收藏级清单｜{{date}}｜{{account}}\n\n' +
      '{{body}}\n\n' +
      '## 如何使用这份清单\n1. \n2. \n\n' +
      '> 如果对你有用，点个「在看」，后续更新不迷路。',
  },
  {
    id: 'short',
    name: '短笔记 / 社交平台',
    desc: '钩子开头 + 短段落 + 标签结尾，适合小红书等平台',
    scope: 'global',
    builtin: true,
    body:
      '{{title}}\n\n' +
      '（开头一句钩子，口语化、带情绪。）\n\n' +
      '{{body}}\n\n' +
      '———\n标签：#干货分享 #{{account}}',
  },
];

/** 把模板里的 {{title}} / {{topic}} / {{account}} / {{date}} 替换为当前项目上下文。 */
export function resolveTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}

/** wrap = 用模板包住现有正文；insert = 只写入骨架，正文位置留占位提示。 */
export function composeTemplate(
  body: string,
  current: string,
  vars: Record<string, string>,
  mode: 'wrap' | 'insert',
): string {
  const resolved = resolveTemplate(body, vars).replace(/\{\{\s*body\s*\}\}/gi, '{{body}}');
  // 用户自定义的整篇模板可能没有正文占位符：包住现有正文时追加到末尾，绝不静默丢内容
  if (mode === 'wrap' && !resolved.includes('{{body}}')) {
    return current.trim() ? resolved + '\n\n' + current.trim() : resolved;
  }
  const replacement =
    mode === 'wrap' && current.trim() ? current.trim() : '（在这里写正文）';
  return resolved.replace(/\{\{\s*body\s*\}\}/g, replacement);
}

/** 从 localStorage 读出的自定义模板做形状校验，坏数据直接丢弃而不是让页面崩。 */
export function normalizeCustomTemplates(raw: unknown): FormatTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: FormatTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    if (
      typeof t.id !== 'string' ||
      typeof t.name !== 'string' ||
      !t.name.trim() ||
      typeof t.body !== 'string' ||
      !t.body.trim()
    ) {
      continue;
    }
    out.push({
      id: t.id,
      name: t.name.slice(0, 40),
      desc: typeof t.desc === 'string' ? t.desc.slice(0, 120) : '自定义排版模板',
      body: t.body.slice(0, 20000),
      builtin: false,
      scope: typeof t.scope === 'string' && t.scope ? t.scope : 'global',
    });
  }
  return out;
}
