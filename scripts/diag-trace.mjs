import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Workbuddy/2026-11-02-17-32-58/web/package.json');
const { parse } = require('@vue/compiler-sfc');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
let i = 0, line = 1, col = 1;
const stack = [];
const trace = [];

function pos() { return { line, col }; }
function adv(n) {
  for (let k = 0; k < n; k++) {
    if (tpl[i + k] === '\n') { line++; col = 1; } else col++;
  }
  i += n;
}

while (i < tpl.length) {
  if (tpl[i] === '<') {
    if (tpl.startsWith('<!--', i)) {
      const end = tpl.indexOf('-->', i + 4);
      adv(end === -1 ? tpl.length - i : end + 3 - i);
      continue;
    }
    if (tpl.startsWith('<!', i) || tpl.startsWith('<?', i)) {
      const end = tpl.indexOf('>', i);
      adv(end === -1 ? tpl.length - i : end + 1 - i);
      continue;
    }
    const isClose = tpl[i + 1] === '/';
    let j = i + (isClose ? 2 : 1);
    while (j < tpl.length && /[a-zA-Z0-9-]/.test(tpl[j])) j++;
    const tagName = tpl.slice(i + (isClose ? 2 : 1), j);
    let k = j, selfClose = false;
    while (k < tpl.length) {
      const ch = tpl[k];
      if (ch === '"' || ch === "'") {
        const q = ch; k++;
        while (k < tpl.length && tpl[k] !== q) k++;
      } else if (ch === '/' && tpl[k + 1] === '>') { selfClose = true; k++; break; }
      else if (ch === '>') break;
      k++;
    }
    const here = pos();
    const dbgSlice = tpl.slice(i, k + 1);
    if (here.line >= 47 && here.line <= 56) {
      console.log(`DBG L${here.line} tagName=${tagName} slice=<${dbgSlice.replace(/\n/g,'⏎')}>`);
    }
    adv(k + 1 - i);
    const tag = tagName.toLowerCase();
    if (VOID.has(tag)) {
      if (line >= 20 && line <= 60) trace.push(`L${here.line} VOID <${tag}>`);
      continue;
    }
    if (isClose) {
      const top = stack[stack.length - 1];
      if (line >= 20 && line <= 60) trace.push(`L${here.line} CLOSE </${tag}> topWas=${top && top.tag} depth=${stack.length - 1}`);
      if (top && top.tag === tag) stack.pop();
      else if (top) { trace.push(`  !! MISMATCH close </${tag}> but top <${top.tag}> (opened L${top.line})`); /* still pop to resync? no */ }
      else trace.push(`  !! STRAY </${tag}>`);
    } else {
      stack.push({ tag, line: here.line });
      if (line >= 20 && line <= 60) trace.push(`L${here.line} OPEN <${tag}> depth=${stack.length}`);
    }
  } else {
    adv(1);
  }
}
console.log(trace.join('\n'));
console.log('\nFINAL STACK (unclosed):', stack.map(s => `<${s.tag}> L${s.line}`).join(', ') || '(empty)');
