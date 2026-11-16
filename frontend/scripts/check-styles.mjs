// Detecta valores sueltos en CSS que deberían ser tokens (ver src/styles/tokens.css).
//   npm run check:styles            → lista los hallazgos
//   npm run check:styles -- --strict → además termina con error si hay alguno
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const strict = process.argv.includes('--strict');

const rules = [
  { name: 'color hex', re: /#[0-9a-fA-F]{3,8}\b/g, hint: 'usa var(--color-*) o la paleta (--slate-*, --blue-*…)' },
  { name: 'font-size px', re: /font-size:\s*\d+(?:\.\d+)?px/g, hint: 'usa var(--text-*)' },
  { name: 'font-weight numérico', re: /font-weight:\s*\d{3}/g, hint: 'usa var(--weight-*)' },
  { name: 'border-radius px', re: /border-radius:\s*(?:[4-9]|1\d|\d{3})px\s*;/g, hint: 'usa var(--radius-*)' },
];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : [];
  });
}

let total = 0;
for (const file of walk(root)) {
  if (file.endsWith('tokens.css')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const r of rules) {
      for (const m of line.matchAll(r.re)) {
        total++;
        console.log(`${relative(root, file)}:${i + 1}  ${r.name}: ${m[0]}  → ${r.hint}`);
      }
    }
  });
}
console.log(total ? `\n${total} valores sin token.` : 'Sin valores sueltos. ✔');
if (strict && total) process.exit(1);
