import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMdCommand,
  BUILTIN_TEMPLATES,
  composeTemplate,
  insertBlock,
  markdownToPlain,
  normalizeCustomTemplates,
  renderMarkdown,
  resolveTemplate,
  richHtmlForClipboard,
} from '../src/utils/markdown-editor.ts';

test('工具栏：加粗选中文本并保留光标选区', () => {
  const src = '这是一段普通正文。';
  const r = applyMdCommand(src, 2, 4, 'bold');
  assert.equal(r.text, '这是**一段**普通正文。');
  assert.equal(r.text.slice(r.start, r.end), '一段');
});

test('工具栏：无选中时插入占位并选中占位文字', () => {
  const r = applyMdCommand('', 0, 0, 'bold');
  assert.equal(r.text, '**加粗文字**');
  assert.equal(r.text.slice(r.start, r.end), '加粗文字');
});

test('工具栏：空行标题给出可替换占位，再点一次可取消标题', () => {
  const first = applyMdCommand('', 0, 0, 'h2');
  assert.equal(first.text, '## 二级标题');
  const second = applyMdCommand('## 二级标题', 0, 11, 'h2');
  assert.equal(second.text, '二级标题');
});

test('工具栏：有序列表自动编号，无序列表可切换关闭', () => {
  const ol = applyMdCommand('甲\n乙\n丙', 0, 5, 'ol');
  assert.equal(ol.text, '1. 甲\n2. 乙\n3. 丙');
  const ul = applyMdCommand('- 甲\n- 乙', 0, 7, 'ul');
  assert.equal(ul.text, '甲\n乙');
});

test('工具栏：引用块可切换，链接把光标定位到 URL', () => {
  const quote = applyMdCommand('第一行\n第二行', 0, 7, 'quote');
  assert.equal(quote.text, '> 第一行\n> 第二行');
  const link = applyMdCommand('官网', 0, 2, 'link');
  assert.equal(link.text, '[官网](https://)');
  assert.equal(link.text.slice(link.start, link.end), 'https://');
});

test('工具栏：整块插入自动补空行，不粘连上下文', () => {
  const r = insertBlock('开头', 2, 2, '---');
  assert.equal(r.text, '开头\n\n---');
  const table = applyMdCommand('正文', 2, 2, 'table');
  assert.ok(table.text.includes('| 维度 | 说明 |'));
  assert.ok(table.text.includes('| --- | --- |'));
});

test('预览：转义 HTML，不执行正文里的脚本', () => {
  const html = renderMarkdown('<script>alert(1)</script> **粗体**');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>粗体</strong>'));
});

test('预览：标题 / 分割线 / 有序列表 / 表格 / 图片都渲染', () => {
  const src = [
    '# 标题',
    '',
    '1. 第一',
    '2. 第二',
    '',
    '| 维度 | 说明 |',
    '| --- | --- |',
    '| 价格 | 99 |',
    '',
    '![封面](https://example.com/a.png)',
    '',
    '---',
    '',
    '~~旧结论~~ 与 `代码` 和 [链接](https://example.com)',
  ].join('\n');
  const html = renderMarkdown(src);
  for (const token of [
    '<h1>标题</h1>',
    '<ol>',
    '<li>第二</li>',
    '<table>',
    '<th>维度</th>',
    '<td>99</td>',
    '<img src="https://example.com/a.png" alt="封面" />',
    '<hr />',
    '<del>旧结论</del>',
    '<code>代码</code>',
    '<a href="https://example.com"',
  ]) {
    assert.ok(html.includes(token), `缺少 ${token}：${html}`);
  }
  assert.ok(!html.includes('<script'));
});

test('复制：纯文本去掉 Markdown 记号但保留内容', () => {
  const plain = markdownToPlain('# 标题\n\n- **重点** ~~旧~~ `代码` [链接](https://a.com)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.ok(plain.includes('标题'));
  assert.ok(plain.includes('重点 旧 代码 链接'));
  assert.ok(!plain.includes('#'));
  assert.ok(!plain.includes('**'));
  assert.ok(!plain.includes('|'));
});

test('复制：富文本带内联样式，粘到公众号可保留排版', () => {
  const html = richHtmlForClipboard(renderMarkdown('# 标题\n\n正文 **加粗**'));
  assert.ok(html.includes('font-family:'));
  assert.ok(html.includes('<h1 style="font-size:24px'));
  assert.ok(html.includes('<p style="margin:10px 0'));
  assert.ok(html.includes('<strong style="font-weight:700'));
});

test('模板：变量代入项目上下文，套用保留原正文', () => {
  const vars = { title: '韩国作弊调查', account: '观察局', date: '2026-11-19', topic: '教育' };
  const tpl = BUILTIN_TEMPLATES.find((t) => t.id === 'deep');
  assert.ok(tpl);
  const wrapped = composeTemplate(tpl.body, '原文第一段。\n\n原文第二段。', vars, 'wrap');
  assert.ok(wrapped.includes('# 韩国作弊调查'));
  assert.ok(wrapped.includes('2026-11-19 · 观察局'));
  assert.ok(wrapped.includes('原文第一段。\n\n原文第二段。'));
  assert.ok(!wrapped.includes('{{'));

  const inserted = composeTemplate(tpl.body, '已有正文', vars, 'insert');
  assert.ok(inserted.includes('（在这里写正文）'));
  assert.ok(!inserted.includes('已有正文'));
});

test('模板：无正文占位符的自定义模板也不会吞掉现有内容', () => {
  const wrapped = composeTemplate('# 我的模板\n\n结尾语。', '原有内容', {}, 'wrap');
  assert.equal(wrapped, '# 我的模板\n\n结尾语。\n\n原有内容');
});

test('模板：未知变量原样保留，便于用户后续手填', () => {
  assert.equal(resolveTemplate('{{title}} / {{author}}', { title: '甲' }), '甲 / {{author}}');
});

test('模板：自定义模板读盘做形状校验，坏数据丢弃', () => {
  const list = normalizeCustomTemplates([
    { id: 'a', name: '合法', body: '# 标题\n\n{{body}}', scope: '观察局' },
    { id: 'b', name: '   ', body: '空名' },
    { id: 'c', name: 123, body: '错类型' },
    null,
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'a');
  assert.equal(list[0].builtin, false);
  assert.equal(list[0].scope, '观察局');
});
