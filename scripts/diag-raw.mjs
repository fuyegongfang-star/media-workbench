import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('../web/package.json', import.meta.url)));
const { parse } = require('@vue/compiler-sfc');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

// For each '<' in the template, print the raw slice up to the FIRST '>' (naive),
// but only for lines 47..58, to reveal what the tokenizer would see.
let i = 0, line = 1;
while (i < tpl.length) {
  if (tpl[i] === '\n') { line++; i++; continue; }
  if (tpl[i] === '<' && line >= 47 && line <= 58) {
    // find first '>' after i
    let j = i + 1;
    while (j < tpl.length && tpl[j] !== '>') j++;
    const slice = tpl.slice(i, Math.min(j + 1, tpl.length));
    console.log(`L${line}: <${slice.replace(/\n/g, '⏎')}>`);
    i = j + 1;
    continue;
  }
  i++;
}
