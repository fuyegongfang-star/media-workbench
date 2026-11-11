import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('../web/package.json', import.meta.url)));
const { parse } = require('@vue/compiler-sfc');

const file = process.argv[2];
const source = readFileSync(file, 'utf-8');

try {
  const { descriptor, errors } = parse(source, { filename: file });
  console.log('PARSE OK (no throw). errors.length =', errors.length);
  for (const e of errors) {
    console.log(' -', e.message, JSON.stringify(e.loc?.start));
  }
  const tpl = descriptor.template;
  console.log('template block lines:', tpl?.content.split('\n').length);
  console.log('template content length:', tpl?.content.length);
  console.log('template.loc.start:', JSON.stringify(tpl?.loc?.start));
  console.log('template.loc.end:', JSON.stringify(tpl?.loc?.end));
  console.log('--- last 160 chars of template content ---');
  console.log(JSON.stringify(tpl?.content.slice(-160)));
} catch (e) {
  console.log('PARSE THREW:', e.message);
  console.log('loc.start =', JSON.stringify(e.loc?.start));
  console.log('loc.end =', JSON.stringify(e.loc?.end));
  // Print surrounding source around the error line (template-relative)
  const tpl = source.split('<template>')[1]?.split('</template>')[0] ?? '';
  const tplLines = tpl.split('\n');
  const ln = e.loc?.start?.line;
  if (ln != null) {
    const from = Math.max(0, ln - 6);
    const to = Math.min(tplLines.length, ln + 3);
    console.log('--- template-relative lines', from + 1, '..', to, '(err line', ln, ') ---');
    for (let i = from; i < to; i++) {
      console.log(String(i + 1).padStart(4), tplLines[i] ?? '');
    }
  }
}
