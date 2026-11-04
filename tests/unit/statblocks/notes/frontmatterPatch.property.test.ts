import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { bodyOf, expectUntouchedLinesKept, int, mulberry32, patched, readAsObsidian } from './patchTestKit';
import { randomNote } from './randomNotes';
import { randomPatch, resetUniqueNames, type PlannedPatch } from './randomPatches';

const CASES = 3000;
const CHUNK = 500;
/** Every so many cases also run patch by patch, each patch applied twice. */
const SEQUENTIAL_EVERY = 3;

/** Runs one seeded case; a failure names the seed, so `runCase(seed)` replays it. */
function runCase(seed: number): void {
  const random = mulberry32(seed);
  resetUniqueNames();
  const note = randomNote(random);
  let model = readAsObsidian(note.text);
  const planned: PlannedPatch[] = [];
  for (let count = 1 + int(random, 6); count > 0; count--) {
    const next = randomPatch(random, model, note.entries);
    planned.push(next);
    model = next.model;
  }
  const patches = planned.map((plan) => plan.patch);
  try {
    const result = patched(note.text, patches);
    expect(result.conflicts).toEqual(planned.filter((plan) => plan.expect === 'stale').map((plan) => plan.patch));
    expect(readAsObsidian(result.text)).toEqual(model);
    const touched = new Set(planned.filter((plan) => plan.expect === 'fresh').flatMap((plan) => plan.touches));
    expectUntouchedLinesKept(note.text, result.text, touched);
    if (planned.every((plan) => plan.expect !== 'fresh')) expect(result.text).toBe(note.text);
    if (seed % SEQUENTIAL_EVERY === 0) {
      const sequential = oneByOne(note.text, patches);
      expect(readAsObsidian(sequential)).toEqual(model);
      expect(bodyOf(sequential)).toBe(bodyOf(result.text));
    }
  } catch (error) {
    const detail = `seed ${seed}\n${JSON.stringify(note.text)}\n${JSON.stringify(patches, null, 1)}`;
    throw new Error(`${detail}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Applies the patches one call each, applying every one twice: a patch applied again changes nothing. */
function oneByOne(text: string, patches: readonly NotePatch[]): string {
  let current = text;
  for (const patch of patches) {
    const once = applyFrontmatterPatches(current, [patch]);
    const twice = applyFrontmatterPatches(once.text, [patch]);
    expect(twice.text).toBe(once.text);
    if (once.applied.length > 0) expect(twice.applied).toEqual([patch]);
    current = once.text;
  }
  return current;
}

// A chunk of 500 notes takes about 1 s here, three to four times that on a hosted runner.
describe('applyFrontmatterPatches on random notes', { timeout: 30_000 }, () => {
  const chunks = Array.from({ length: CASES / CHUNK }, (_, index) => index * CHUNK + 1);
  it.each(chunks)('keeps every invariant for seeds %i to +499', (first) => {
    for (let seed = first; seed < first + CHUNK; seed++) runCase(seed);
  });
});
