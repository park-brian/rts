import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Kind, Units } from '../src/data.ts';

const PLAN = readFileSync(new URL('../../../plan.md', import.meta.url), 'utf8');
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
