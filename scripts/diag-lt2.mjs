import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Workbuddy/2026-11-02-17-32-58/web/package.json');
const { parse } = require('@vue/compiler-sfc');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

let i = 0, line = 1, inTag = false, textAcc = '', textLine = 0;
const regions = [];
while (i < tpl.length) {
  const c = tpl[i];
  if (c === '\n') { line++; i++; continue; }
  if (!inTag && c === '<') {
    if (textAcc) regions.push({ line: textLine, text: textAcc });
    textAcc = ''; inTag = true; i++; continue;
  }
  if (inTag && c === '>') { inTag = false; i++; continue; }
  if (!inTag) { if (!textAcc) textLine = line; textAcc += c; }
  i++;
}
if (textAcc) regions.push({ line: textLine, text: textAcc });

let found = 0;
for (const r of regions) {
  if (r.text.includes('<')) {
    found++;
    // show each '<' with context
    for (const m of r.text.matchAll(/</g)) {
      const idx = m.index;
      console.log(`LINE ~${r.line}: ...${JSON.stringify(r.text.slice(Math.max(0, idx - 30), idx + 25))}...`);
    }
  }
}
console.log('Text regions containing "<":', found);
