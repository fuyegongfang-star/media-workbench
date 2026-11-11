import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Workbuddy/2026-11-02-17-32-58/web/package.json');
const { parse } = require('@vue/compiler-sfc');
const { baseParse } = require('@vue/compiler-dom');
const { NodeTypes } = require('@vue/compiler-core');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

const ast = baseParse(tpl, { onError() {} });

function walk(node, depth) {
  if (!node) return;
  if (node.type === NodeTypes.ELEMENT) {
    const s = node.loc?.start?.offset;
    console.log('  '.repeat(depth) + `<${node.tag}> @${s}`);
    for (const c of node.children || []) walk(c, depth + 1);
  } else if (node.type === NodeTypes.TEXT) {
    const t = (node.content || '').replace(/\s+/g, ' ').slice(0, 20);
    if (t.trim()) console.log('  '.repeat(depth) + `TEXT "${t}..."`);
  } else if (node.children) {
    for (const c of node.children) walk(c, depth);
  }
}
for (const c of ast.children) walk(c, 0);
