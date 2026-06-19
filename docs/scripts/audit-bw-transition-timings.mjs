import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join, relative, resolve } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DOC = join(ROOT, 'docs', 'research', 'bw-transition-timings.md');
const args = process.argv.slice(2);
const requireSourced = args.includes('--require-sourced');
const explicitRoots = args.filter((arg) => !arg.startsWith('--'));

const defaultRoots = ['tmp', 'docs/research', 'docs/specs'];
const roots = (explicitRoots.length ? explicitRoots : defaultRoots)
  .map((root) => resolve(ROOT, root))
  .filter((root) => existsSync(root));

const sourceNames = new Set([
  'iscript.bin',
  'units.dat',
  'images.dat',
  'sprites.dat',
  'flingy.dat',
  'orders.dat',
]);

const traceExtensions = new Set(['.json', '.jsonl', '.csv', '.trace', '.rep']);
const traceNeedles = [
  'transition',
  'burrow',
  'unburrow',
  'siege',
  'unsiege',
  'orders::burrowing',
  'orders::unburrowing',
  'orders::sieging',
  'yamato',
  'fireyamatogun',
  'move_to_fire_yamato',
  'movetofireyamatogun',
];
const skippedDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.cache']);

const normalize = (path) => relative(ROOT, path).replaceAll('\\', '/');

const hashFile = (path) => {
  const bytes = readFileSync(path);
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
};

const isTraceCandidate = (path) => {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  if (!traceExtensions.has(ext)) return false;
  if (traceNeedles.some((needle) => name.includes(needle))) return true;

  try {
    const text = readFileSync(path, 'utf8').slice(0, 16384).toLowerCase();
    return traceNeedles.some((needle) => text.includes(needle));
  } catch {
    return false;
  }
};

const walk = (root, out = []) => {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) continue;
      walk(path, out);
      continue;
    }
    if (!entry.isFile()) continue;

    const lower = entry.name.toLowerCase();
    if (sourceNames.has(lower) || isTraceCandidate(path)) out.push(path);
  }
  return out;
};

const candidates = roots.flatMap((root) => walk(root)).sort();
const primary = candidates.filter((path) => sourceNames.has(basename(path).toLowerCase()));
const traces = candidates.filter((path) => !sourceNames.has(basename(path).toLowerCase()));
const doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';
const unsourcedRows = [...doc.matchAll(/\|\s*([^|]+?)\s*\|[^|\n]*\|\s*[^|\n]*\|\s*Unsourced\s*\|/gi)]
  .map((match) => match[1].trim())
  .filter((name) => name && name !== 'Transition');

console.log('Brood War transition timing source audit');
console.log(`Roots: ${roots.map(normalize).join(', ') || '(none)'}`);
console.log('');

if (primary.length) {
  console.log('Primary data candidates:');
  for (const path of primary) {
    const st = statSync(path);
    console.log(`- ${normalize(path)} (${st.size} bytes, sha256:${hashFile(path)})`);
  }
} else {
  console.log('Primary data candidates: none');
}

console.log('');

if (traces.length) {
  console.log('Measured trace candidates:');
  for (const path of traces) {
    const st = statSync(path);
    console.log(`- ${normalize(path)} (${st.size} bytes, sha256:${hashFile(path)})`);
  }
} else {
  console.log('Measured trace candidates: none');
}

console.log('');

if (unsourcedRows.length) {
  console.log('Still unsourced in docs/research/bw-transition-timings.md:');
  for (const row of unsourcedRows) console.log(`- ${row}`);
} else {
  console.log('No unsourced transition rows found in docs/research/bw-transition-timings.md.');
}

if (requireSourced && unsourcedRows.length) {
  console.error('');
  console.error('Refusing --require-sourced because transition timing rows are still unsourced.');
  process.exitCode = 1;
}
