import type { DieTag } from '../../../tools/diceTags';
import { addDie, removeDie, TRAY_DICE, type TrayDie, type TrayPool } from './diceTrayPool';

/** A die in the tray, in the colour it was added in (null: none). */
export interface TrayPick {
  sides: TrayDie;
  tag: DieTag | null;
}

/** How many of each die the picks hold. */
export function poolOfPicks(picks: readonly TrayPick[]): TrayPool {
  const pool: TrayPool = {};
  for (const { sides } of picks) pool[sides] = (pool[sides] ?? 0) + 1;
  return pool;
}

/** One more die of this kind in `tag`, within the tray's limits. */
export function addPick(picks: readonly TrayPick[], sides: TrayDie, tag: DieTag | null): readonly TrayPick[] {
  const pool = poolOfPicks(picks);
  return addDie(pool, sides) === pool ? picks : [...picks, { sides, tag }];
}

/** The die of this kind added last goes back. */
export function removePick(picks: readonly TrayPick[], sides: TrayDie): readonly TrayPick[] {
  const index = picks.findLastIndex((pick) => pick.sides === sides);
  return index === -1 || removeDie(poolOfPicks(picks), sides) === poolOfPicks(picks) ? picks : picks.filter((_, i) => i !== index);
}

/**
 * The tags of the tray's formula (`trayFormula`), one per die in formula order: the kinds in
 * ascending order, each kind's dice in the order they were added.
 */
export function trayTags(picks: readonly TrayPick[]): Array<DieTag | null> {
  return TRAY_DICE.flatMap((sides) => picks.filter((pick) => pick.sides === sides).map((pick) => pick.tag));
}

/** The tagged dice, grouped by tag in the order the tags were first used: `Fire: 2d6 + 1d20`. */
export function taggedGroups(picks: readonly TrayPick[]): Array<{ tag: DieTag; dice: string }> {
  const groups = new Map<string, { tag: DieTag; picks: TrayPick[] }>();
  for (const pick of picks) {
    if (!pick.tag) continue;
    const key = `${pick.tag.color}|${pick.tag.colorName}`;
    const group = groups.get(key) ?? { tag: pick.tag, picks: [] };
    group.picks.push(pick);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ tag, picks: own }) => {
    const pool = poolOfPicks(own);
    const dice = TRAY_DICE.filter((sides) => (pool[sides] ?? 0) > 0).map((sides) => `${pool[sides]}d${sides}`).join(' + ');
    return { tag, dice };
  });
}
