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

test('command console uses a fixed-cell table with no horizontal scroll lane', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const desktopBottomChrome = \(width: number\): number =>/);
  assert.match(ui, /root\.style\.setProperty\('--bottom-chrome', bottom\)/);
  assert.match(ui, /data-command-table="true"/);
  assert.match(ui, /gridTemplateColumns:\s*`repeat\(\$\{p\.metrics\.columns\}, minmax\(0, 1fr\)\)`/);
  assert.match(ui, /gridAutoRows:\s*`\$\{p\.metrics\.cellHeight\}px`/);
  assert.match(ui, /<Btn command label="More"/);
  assert.match(ui, /build:\s*'Build Orders'/);
  assert.doesNotMatch(ui, /overflowX:\s*'auto'/);
  assert.doesNotMatch(ui, /scrollbarWidth:\s*'thin'/);
  assert.doesNotMatch(ui, /`Build \$\{short/);
});

test('mobile chrome exposes a compact queued-travel toggle', () => {
  const store = readFileSync(resolve(appRoot, 'src', 'store.ts'), 'utf8');
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(store, /mobileQueueMode:\s*signal\(false\)/);
  assert.match(ui, /ui\.controlScheme\.value === 'mobile' &&/);
  assert.match(ui, /label="Queue" active=\{ui\.mobileQueueMode\.value\}/);
  assert.match(ui, /ui\.mobileQueueMode\.value = !ui\.mobileQueueMode\.value/);
});

test('desktop console exposes control group chips without sharing command space', () => {
  const ui = readFileSync(resolve(appRoot, 'src', 'ui.tsx'), 'utf8');

  assert.match(ui, /const ControlGroups = \(p: \{ game: Game; compact\?: boolean \}\)/);
  assert.match(ui, /p\.compact \? 'repeat\(5, minmax\(0, 1fr\)\)' : 'repeat\(10, minmax\(0, 1fr\)\)'/);
  assert.match(ui, /p\.game\.assignControlGroup\(index\)/);
  assert.match(ui, /p\.game\.recallControlGroup\(index, e\.shiftKey\)/);
  assert.match(ui, /e\.ctrlKey \|\| e\.metaKey/);
  assert.match(ui, /<SelectionPanel game=\{g\} compact=\{metrics\.compactSelection\} \/>/);
});

test('math renderer exposes a subtle build-tile grid for placement audits', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');

  assert.match(render2d, /Math mode is the canonical gameplay-geometry view/);
  assert.match(render2d, /rgba\(125,\s*170,\s*210,\s*0\.10\)/);
  assert.match(render2d, /for \(let x = 0; x <= m\.w \* TILE; x \+= TILE\)/);
  assert.match(render2d, /for \(let y = 0; y <= m\.h \* TILE; y \+= TILE\)/);
});

test('renderer draws queued travel waypoints from sim descriptors', () => {
  const render2d = readFileSync(resolve(appRoot, 'src', 'render2d.ts'), 'utf8');

  assert.match(render2d, /queuedTravelWaypoints/);
  assert.match(render2d, /drawQueuedTravelWaypoints\(ctx, game\)/);
  assert.match(render2d, /attack-move/);
});
