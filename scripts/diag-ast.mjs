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

let ast;
try { ast = baseParse(tpl, { onError() {} }); } catch (e) { console.log('throw', e.message); }

const all = [];
function walk(node, depth) {
  if (!node) return;
  if (node.type === NodeTypes.ELEMENT) {
    const s = node.loc?.start?.offset ?? -1;
    const e = node.loc?.end?.offset ?? -1;
    all.push({ tag: node.tag, start: s, end: e, span: e - s, depth });
    for (const c of node.children || []) walk(c, depth + 1);
  } else if (node.children) {
    for (const c of node.children) walk(c, depth);
  }
}
for (const c of ast.children) walk(c, 0);

all.sort((a, b) => b.span - a.span);
const thr = tpl.length * 0.9;
const atEof = all.filter(c => c.end >= thr).sort((a,b)=>a.start-b.start);
console.log(`Elements whose end >= ${thr} (auto-closed near EOF), sorted by start:`);
for (const c of atEof) {
  console.log(`<${c.tag}> start=${c.start} end=${c.end} span=${c.span} depth=${c.depth}`);
}
console.log('\nTop 6 widest overall:');
for (const c of all.slice(0, 6)) {
  console.log(`<${c.tag}> start=${c.start} end=${c.end} span=${c.span} depth=${c.depth}`);
}
