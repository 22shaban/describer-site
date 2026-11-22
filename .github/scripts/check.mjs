// Dependency-free sanity checks for the static site. Run: node .github/scripts/check.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { Script } from 'node:vm';
import { join } from 'node:path';

let failed = 0;
const ok = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failed++; console.error(`FAIL  ${m}`); };

// 1. Inline <script> blocks in index.html must parse.
const html = readFileSync('index.html', 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)];
blocks.forEach(([, attrs, code], i) => {
  if (/type\s*=\s*["']?(module|application\/json|importmap)/i.test(attrs)) return;
  try { new Script(code, { filename: `index.html#script${i + 1}` }); ok(`inline script ${i + 1} parses`); }
  catch (e) { fail(`inline script ${i + 1}: ${e.message}`); }
});

// 2. Service worker must parse.
try { new Script(readFileSync('sw.js', 'utf8'), { filename: 'sw.js' }); ok('sw.js parses'); }
catch (e) { fail(`sw.js: ${e.message}`); }

// 3. Manifest must be valid JSON and its icons must exist.
try {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  ok('manifest.webmanifest is valid JSON');
  for (const icon of m.icons ?? []) existsSync(icon.src) ? ok(`icon ${icon.src} exists`) : fail(`missing icon ${icon.src}`);
} catch (e) { fail(`manifest: ${e.message}`); }

// 4. Files the service worker pre-caches must exist.
const shell = [...readFileSync('sw.js', 'utf8').matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((f) => f.includes('.'));
for (const f of shell) existsSync(f) ? ok(`cached file ${f} exists`) : fail(`sw.js caches missing file ${f}`);

// 5. No API keys committed.
const patterns = [/AIza[0-9A-Za-z_-]{35}/, /sk-[A-Za-z0-9]{32,}/, /gsk_[A-Za-z0-9]{20,}/, /ghp_[A-Za-z0-9]{30,}/];
const walk = (d) => readdirSync(d).flatMap((n) => {
  if (n === '.git' || n === 'node_modules') return [];
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const f of walk('.')) {
  if (/\.(png|jpe?g|gif|ico|webp)$/i.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const re of patterns) if (re.test(text)) fail(`possible secret in ${f} (${re})`);
}
if (!failed) ok('no API key patterns found');

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
