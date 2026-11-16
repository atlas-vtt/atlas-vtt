import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../../src/app/dungeons/model';
import { canonicalJson, hashText } from '../../../src/app/utils/hashing';

const TAG_SETS: readonly string[][] = [[], ['large', 'wet'], ['small', 'secret'], ['crumbling', 'overgrown']];

/** Fortress and Haunted Mansion dungeons as the Cavern's layout must leave them. */
const REQUESTS: readonly DungeonRequest[] = Array.from({ length: 40 }, (_, i) => {
  const k = i + 1;
  return { seed: k * 104_729, theme: k % 2 === 0 ? 'fortress' : 'mansion', tags: TAG_SETS[k % TAG_SETS.length] ?? [], floors: 1 + (k % 3) };
});

/**
 * Recorded with `VITE_DUNGEON_HASHES=print` when the dungeons took their structure alone (statues,
 * busts, fireplaces and daises; no furniture) with every kept piece drawn, and the Mansions again
 * when they took no cover beyond their rooms' own, and the Fortresses again when their passages
 * grew wide and their round rooms became towers, and the Mansions again when they became houses
 * and when their windows took a manor's rules, and when their chimney stacks became few, and when
 * their grounds were drawn (2026-10-25), and when their ways were laid out on the door's axis and
 * round their turns (2026-10-26) (every Fortress hash unchanged each time), and once more when
 * numbers were rounded before hashing (2026-10-26, nothing generated changed), and once more when
 * the generator's version was left out of the hash (2026-10-31, recorded before the Cavern raised
 * it, nothing generated changed); never re-recorded for a change of the Cavern alone.
 */
const HASHES: readonly string[] = [
  'z53038w21',
  'g1qpsuodk1',
  '1l4d2mtrgrl',
  '1ssnafgqfdh',
  '1qo8icampdg',
  '1ubeuqzyhtb',
  '13519ilwlq8',
  'e1su16fsrs',
  '29ulewrku18',
  '2boernl544y',
  '1bvr3dijg5r',
  'dqdomc6nz5',
  '2gdoux83ag3',
  '2590ecovwsc',
  '1whwen2nhdo',
  '1ikdruwfuuv',
  '2g3ctailmw0',
  '1oxouoytygt',
  '1ozj628wplf',
  'bh1sgukjyn',
  '23g3rjea6ku',
  'ea31ua5pw7',
  'tfnm1wt00r',
  '1mz063hhpz9',
  '1z4g4g896ql',
  '14a1p0x42dd',
  'abtlcyhd83',
  '1kc9vtjtsv3',
  'rsruo3qysh',
  '6e0sc0ftkh',
  '4mh8v0j0zh',
  '1q5fw6qmb8i',
  'celn8pna37',
  'jmww7oo4gr',
  '4xc06zn22u',
  '219odkhw11o',
  'kfov6xht6r',
  '1g5bq84ygm6',
  '1282j0uvtnr',
  'bee25uot9r',
];

/**
 * The model with its numbers to nine decimals: V8's maths can differ in the last bit between
 * processors (fused multiply-add on ARM, not on x86), and the hashes must hold on every machine.
 */
const rounded = (model: unknown): unknown => JSON.parse(JSON.stringify(model, (_key, value: unknown) => (typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value)));

/** The dungeon without the generator's version (`rounded` drops it): a change of the Cavern alone raises it, and leaves these dungeons as they were. */
const unversioned = (model: DungeonModel): unknown => ({ ...model, version: undefined });

describe('dungeons of the other themes', () => {
  it('are the same as before the Cavern had a layout of its own', () => {
    const hashes = REQUESTS.map((request) => hashText(canonicalJson(rounded(unversioned(generateDungeon(request))))));
    if (import.meta.env.VITE_DUNGEON_HASHES === 'print') {
      console.log(JSON.stringify(hashes));
      return;
    }
    expect(hashes).toEqual(HASHES);
  }, 120_000);
});
