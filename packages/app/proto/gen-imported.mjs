import { readFileSync, writeFileSync } from 'node:fs';

// Each ref: source file + a color→token map. Background path is dropped; the team
// body tones map to TEAMFILL/TEAMDARK/TEAMLITE; accents/blacks keep fixed colors.
const refs = {
  mutalisk: { file: 'proto/muta.svg', bg: 'rgb(248,80,38)', scale: 1.0, map: [
    ['rgb(1,0,0)', 'TEAMFILL'], ['rgb(214,210,219)', 'TEAMLITE'], ['rgb(233,161,142)', '#e9a18e'],
  ]},
  hydralisk: { file: 'proto/hydra.svg', bg: 'rgb(244,244,232)', scale: 1.08, map: [
    ['rgb(63,92,212)', 'TEAMFILL'], ['rgb(34,60,165)', 'TEAMDARK'], ['rgb(138,147,192)', 'TEAMLITE'],
    ['rgb(249,64,33)', '#fb4021'], ['rgb(227,89,64)', '#e3593f'], ['rgb(1,0,2)', '#0a0a0e'],
  ]},
};

const entries = [];
for (const [name, r] of Object.entries(refs)) {
  let s = readFileSync(r.file, 'utf8');
  // drop the background rect path and any metadata
  s = s.replace(new RegExp('<path d="M 0 0 L 2048[^>]*' + r.bg.replace(/[()]/g, '\\$&') + '[^>]*></path>'), '');
  s = s.replace(/<path d="M 0 0 L 2048[^>]*><\/path>/, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  let inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  inner = inner.replace(/\s+transform="translate\(0,0\)"/g, '');
  for (const [from, to] of r.map) inner = inner.split(from).join(to);
  const wrapped = '<g transform="scale(0.03125)">' + inner + '</g>';
  entries.push('  ' + name + ': { scale: ' + r.scale + ', svg: ' + JSON.stringify(wrapped) + ' },');
}

const out = '// Imported high-fidelity sprite art (hand/AI-authored vector). Each entry overrides\n'
 + '// the procedural roster sprite of the same name. Team-body tones map to the three\n'
 + '// team tokens (TEAMFILL / TEAMDARK shadow / TEAMLITE highlight) so they recolor and\n'
 + '// shade per player; accents/blacks keep fixed colors. Authored at 2048px, scaled to\n'
 + '// the 64x64 sprite space. Regenerate via proto/gen-imported.mjs.\n'
 + 'export const IMPORTED: Record<string, { svg: string; scale?: number }> = {\n'
 + entries.join('\n') + '\n};\n';
writeFileSync('src/art/imported.ts', out);
console.log('wrote imported.ts with', Object.keys(refs).join(', '));
