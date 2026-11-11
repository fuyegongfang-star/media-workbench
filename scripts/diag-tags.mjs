import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Workbuddy/2026-11-02-17-32-58/web/package.json');
const { parse } = require('@vue/compiler-sfc');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

// Void elements (no closing tag needed)
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

// Tokenize template into tags + text, skipping comments.
let i = 0;
const stack = []; // {tag, line, col}
let line = 1, col = 1;
const errors = [];

function advance(n) {
  for (let k = 0; k < n; k++) {
    if (tpl[i + k] === '\n') { line++; col = 1; } else col++;
  }
  i += n;
}
function pos() { return { line, col }; }

while (i < tpl.length) {
  const c = tpl[i];
  if (c === '<') {
    // comment
    if (tpl.startsWith('<!--', i)) {
      const end = tpl.indexOf('-->', i + 4);
      if (end === -1) { errors.push('UNTERMINATED COMMENT at ' + JSON.stringify(pos())); break; }
      advance(end + 3 - i);
      continue;
    }
    // doctype / processing / etc
    if (tpl.startsWith('<!', i) || tpl.startsWith('<?', i)) {
      const end = tpl.indexOf('>', i);
      if (end === -1) break;
      advance(end + 1 - i);
      continue;
    }
    const isClose = tpl[i + 1] === '/';
    // read tag name
    let j = i + (isClose ? 2 : 1);
    while (j < tpl.length && /[a-zA-Z0-9-]/.test(tpl[j])) j++;
    const tagName = tpl.slice(i + (isClose ? 2 : 1), j);
    // find end of tag (the '>')
    let k = j;
    let selfClose = false;
    while (k < tpl.length) {
      if (tpl[k] === '"' || tpl[k] === "'") {
        const q = tpl[k]; k++;
        while (k < tpl.length && tpl[k] !== q) k++;
      } else if (tpl[k] === '/' && tpl[k + 1] === '>') { selfClose = true; k++; }
      else if (tpl[k] === '>') break;
      k++;
    }
    const openPos = pos();
    advance(k + 1 - i); // consume through '>'
    if (!tagName) { errors.push('EMPTY TAG NAME at ' + JSON.stringify(openPos)); continue; }
    if (VOID.has(tagName.toLowerCase())) continue;
    if (isClose) {
      const top = stack.pop();
      if (process.env.DBG && openPos.line >= 47 && openPos.line <= 60) {
        console.log('@line', openPos.line, 'close', tagName, 'stackTop=', top && top.tag, 'fullStack=', JSON.stringify(stack.map(s=>s.tag+':'+s.line)));
      }
      if (!top) {
        errors.push('STRAY CLOSE </' + tagName + '> at ' + JSON.stringify(openPos));
      } else if (top.tag.toLowerCase() !== tagName.toLowerCase()) {
        errors.push('MISMATCH: expected </' + top.tag + '> (opened at ' + JSON.stringify(top.pos) + ') but got </' + tagName + '> at ' + JSON.stringify(openPos));
      }
    } else {
      if (!selfClose) stack.push({ tag: tagName, line: openPos.line, col: openPos.col });
    }
  } else {
    // text — but a '<' in text followed by a letter is a spurious tag start.
    advance(1);
  }
}

if (stack.length) {
  errors.push('UNCLOSED (stack remains):');
  for (const s of stack) errors.push('  <' + s.tag + '> opened at line ' + s.line + ' col ' + s.col);
}
console.log(errors.length ? errors.join('\n') : 'TAG STACK BALANCED (no imbalance found by this checker)');
