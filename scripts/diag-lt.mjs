import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('../web/package.json', import.meta.url)));
const { parse } = require('@vue/compiler-sfc');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

// Properly split into tags and text using a tiny state machine that mirrors HTML tokenization enough:
// track inTag, and within text, flag any '<' that is followed by a letter/digit or '!' or '/' (potential tag start),
// EXCEPT when it is a real tag (we are in text, so any '<' here is spurious).
let i = 0;
let line = 1;
let inTag = false;
let textAcc = '';
let textLine = 0;
const hits = [];

while (i < tpl.length) {
  const c = tpl[i];
  if (c === '\n') { line++; i++; continue; }
  if (!inTag && c === '<') {
    // flush text
    if (textAcc.trim()) hits.push({ line: textLine, text: textAcc.trim() });
    textAcc = '';
    inTag = true;
    i++;
    continue;
  }
  if (inTag && c === '>') {
    inTag = false;
    i++;
    continue;
  }
  if (!inTag) {
    if (!textAcc) textLine = line;
    textAcc += c;
  }
  i++;
}
if (textAcc.trim()) hits.push({ line: textLine, text: textAcc.trim() });

// Now scan each text hit for a '<' followed by a letter/digit/'!'/'/'
let found = 0;
for (const h of hits) {
  const m = [...h.text.matchAll(/<[a-zA-Z!/]/g)];
  if (m.length) {
    for (const mm of m) {
      const idx = mm.index;
      console.log(`LINE ~${h.line}: suspicious '<' in text: ...${JSON.stringify(h.text.slice(Math.max(0, idx - 25), idx + 15))}...`);
      found++;
    }
  }
}
console.log(found ? `\nFound ${found} suspicious '<' sequences in TEXT.` : 'No suspicious "<" in text regions.');
console.log('Total text regions scanned:', hits.length);
