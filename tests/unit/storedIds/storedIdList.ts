import { expect } from 'vitest';

/** A family of ids that files in users' vaults name, as a failing test describes it. */
export interface StoredIdList {
  /** What the ids are, as the failure names them: "Built-in game system preset ids". */
  what: string;
  /** Which files name them, as the subject of a sentence: "Collections (`collection.json`) and campaigns". */
  namedBy: string;
  /** How an id that must go keeps working, where the code has a way; without one there is none yet. */
  retiredThrough?: string;
}

const NO_WAY_YET = 'Nothing maps an old id of this kind to a new one yet: taking one away needs the maintainer, and such a mapping first.';

/**
 * Holds the ids the code has now (`actual`) to the list written in the test (`pinned`). The
 * list only grows: an id that left it, renamed or removed, fails with one message, and an id
 * the list lacks with another.
 */
export function expectStoredIds(list: StoredIdList, actual: readonly string[], pinned: readonly string[]): void {
  const gone = pinned.filter((id) => !actual.includes(id));
  const unlisted = actual.filter((id) => !pinned.includes(id));
  expect(
    gone,
    `${list.what}: the code no longer has these ids, so one was renamed or removed. ${list.namedBy} name them, and a file that names an id the code `
    + `lacks loses what it stored under it. Put the id back as it was. ${list.retiredThrough ?? NO_WAY_YET}`,
  ).toEqual([]);
  expect(
    unlisted,
    `${list.what}: the list in this test lacks these ids. An id may be added: append it to the list in the same change. `
    + 'From then on files name it too, and it is never renamed or removed.',
  ).toEqual([]);
}

/** `expectStoredIds` for ids that come in groups (each game system's own): a group the other side lacks counts as empty. */
export function expectStoredIdGroups(list: StoredIdList, actual: Readonly<Record<string, readonly string[]>>, pinned: Readonly<Record<string, readonly string[]>>): void {
  for (const group of new Set([...Object.keys(pinned), ...Object.keys(actual)])) {
    expectStoredIds({ ...list, what: `${list.what} of ${group}` }, actual[group] ?? [], pinned[group] ?? []);
  }
}
