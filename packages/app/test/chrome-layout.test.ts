import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

test('game canvas is laid out between reserved top and bottom chrome', () => {
  const html = readFileSync(resolve(appRoot, 'index.html'), 'utf8');

  assert.match(html, /#game, #overlay\s*{[^}]*top:\s*var\(--top-chrome\);/s);
  assert.match(html, /#game, #overlay\s*{[^}]*height:\s*calc\(100dvh - var\(--top-chrome\) - var\(--bottom-chrome\)\);/s);
  assert.doesNotMatch(html, /#game, #overlay\s*{[^}]*height:\s*auto;/s);
  assert.match(html, /--top-chrome:/);
  assert.match(html, /--bottom-chrome:/);
});

test('hud bars are solid separate chrome, not glass overlays', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /background:\s*'#0b0e13'/);
  assert.match(ui, /borderBottom:\s*'1px solid #1e2733'/);
  assert.match(ui, /borderTop:\s*'1px solid #1e2733'/);
  assert.doesNotMatch(ui, /backdropFilter/);
  assert.doesNotMatch(ui, /rgba\(11,\s*14,\s*19/);
});
