import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Workbuddy/2026-11-02-17-32-58/web/package.json');
const { parse } = require('@vue/compiler-sfc');
const { baseParse } = require('@vue/compiler-dom');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');
const { descriptor } = parse(source, { filename: file });
const tpl = descriptor.template.content;

try {
  baseParse(tpl, {});
  console.log('NO THROW (unexpected)');
} catch (e) {
  console.log('THROW message:', e.message);
  console.log('code:', e.code);
  console.log('loc.start:', JSON.stringify(e.loc?.start));
  console.log('loc.end:', JSON.stringify(e.loc?.end));
  const off = e.loc?.start?.offset;
  if (off != null) {
    const from = Math.max(0, off - 200);
    const to = Math.min(tpl.length, off + 60);
    console.log('--- source around error start offset', off, '---');
    console.log(tpl.slice(from, to).replace(/\n/g, '⏎'));
  }
}
