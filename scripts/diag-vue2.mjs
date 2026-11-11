import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('../web/package.json', import.meta.url)));
const { parse } = require('@vue/compiler-sfc');
const { baseParse } = require('@vue/compiler-dom');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

const errors = [];
try {
  baseParse(tpl, { onError: (e) => errors.push(e) });
} catch (e) {
  console.log('STILL THREW:', e.message);
}
for (const e of errors) {
  console.log('ERR code=', e.code, 'msg=', JSON.stringify(e.message));
  console.log('  loc.start=', JSON.stringify(e.loc?.start), 'loc.end=', JSON.stringify(e.loc?.end));
  // print source around the error start
  const off = e.loc?.start?.offset;
  if (off != null) {
    const from = Math.max(0, off - 120);
    const to = Math.min(tpl.length, off + 40);
    console.log('  --- around start offset', off, '---');
    console.log('  ' + JSON.stringify(tpl.slice(from, to)));
  }
}
