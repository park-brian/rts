import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Kind, Role, Units, WorkerBuildKinds } from '../src/data/index.ts';

const PLAN = [
  '../../../plan.md',
  '../../../docs/archived-plans/scbw-spec-completion-plan-2026-06-19.md',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
const kindNames = new Map<number, string>(
  Object.entries(Kind).map(([name, value]) => [value, name]),
);

test('unit definition notes are either removed or explicitly tracked in the roadmap', () => {
  const untracked: string[] = [];

  for (const [kindText, def] of Object.entries(Units)) {
    for (const note of def.notes) {
      if (note.trim() === '') continue;
      if (!PLAN.includes(note)) untracked.push(`${kindNames.get(Number(kindText)) ?? kindText}: ${note}`);
    }
  }

  assert.deepEqual(untracked, []);
});

test('worker build palettes expose valid worker-startable structures', () => {
  const missingWorkerBuiltStructures: string[] = [];
  const invalidPaletteEntries: string[] = [];

  for (const [kindText, def] of Object.entries(Units)) {
    const kind = Number(kindText);
    if ((def.roles & Role.Structure) === 0 || def.buildMethod !== 'worker') continue;
    if (def.race !== 'terran' && def.race !== 'protoss') continue;
    if (!WorkerBuildKinds[def.race].includes(kind)) {
      missingWorkerBuiltStructures.push(kindNames.get(kind) ?? kindText);
    }
  }

  for (const race of ['terran', 'protoss', 'zerg'] as const) {
    for (const kind of WorkerBuildKinds[race]) {
      const def = Units[kind];
      if (!def || (def.roles & Role.Structure) === 0 || def.race !== race) {
        invalidPaletteEntries.push(`${race}: ${kindNames.get(kind) ?? kind}`);
      }
    }
  }

  assert.deepEqual(missingWorkerBuiltStructures, []);
  assert.deepEqual(invalidPaletteEntries, []);
});
