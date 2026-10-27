import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonRequest } from '../../../src/app/dungeons/model';
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
 * numbers were rounded before hashing (2026-10-26, nothing generated changed); never re-recorded
 * for a change of the Cavern alone.
 */
const HASHES: readonly string[] = [
  '16pye7phdei',
  '25j12icbz49',
  '7hwkqz4kkx',
  '1jsd9qip67r',
  '202n7piegep',
  '2fzk20z7i7i',
  '2e33e3yrxjn',
  'o5o0eamqd2',
  '2fobojesfm2',
  '1ecu65xx1ga',
  '22raymda8l3',
  '1bv5lluampk',
  '1lg7bka7odd',
  '24nlz2yltle',
  'uha7z7tn5x',
  '294f8povhho',
  '19q4fsww7e0',
  'm8hb07gglx',
  '17gw1ugs3fi',
  '1pvr4zbq5po',
  '1tnaqfmlw1w',
  '15djcpvpkwo',
  'xhe7gh0rwn',
  '20kyi7mtbc7',
  '11ba29ud086',
  'ahsl3gyz3t',
  '20o1zx6hljv',
  'scpt6glpbd',
  '1je3wd8yme8',
  'xnrkwx50o8',
  '2g5roebsvos',
  '1hcicm9qx9j',
  '4gk1ua18rn',
  '2fz8ohdu17m',
  '14shkc3xsmm',
  '26j5wwsn2xu',
  '1t8s1rlurf3',
  '1nht7sapp75',
  'cl00ruoi9w',
  '1xzksvx5t96',
];

/**
 * The model with its numbers to nine decimals: V8's maths can differ in the last bit between
 * processors (fused multiply-add on ARM, not on x86), and the hashes must hold on every machine.
 */
const rounded = (model: unknown): unknown => JSON.parse(JSON.stringify(model, (_key, value: unknown) => (typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value)));

describe('dungeons of the other themes', () => {
  it('are the same as before the Cavern had a layout of its own', () => {
    const hashes = REQUESTS.map((request) => hashText(canonicalJson(rounded(generateDungeon(request)))));
    if (import.meta.env.VITE_DUNGEON_HASHES === 'print') {
      console.log(JSON.stringify(hashes));
      return;
    }
    expect(hashes).toEqual(HASHES);
  }, 120_000);
});
