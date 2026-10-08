/** The bodies in the tray, in the order they stand in the formula. */
export const TRAY_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
export type TrayDie = (typeof TRAY_DICE)[number];

/** How many dice of one kind the tray holds. */
export const MAX_PER_DIE = 20;
/** How many dice the tray holds in all, so a finger resting on d100 cannot build a roll of hundreds. */
export const MAX_DICE = 100;
export const MAX_MODIFIER = 20;

export type TrayPool = Partial<Record<TrayDie, number>>;

/**
 * What lies in the tray, as a formula: `2d6 + 1d20 + 3`. The dice stand in
 * ascending order whatever order they were picked in, so the same tray always
 * reads the same; a modifier of 0 is left out.
 */
export function trayFormula(pool: TrayPool, modifier: number): string {
  const terms = TRAY_DICE.filter((sides) => (pool[sides] ?? 0) > 0).map((sides) => `${pool[sides]}d${sides}`);
  if (terms.length === 0) return '';
  const dice = terms.join(' + ');
  if (modifier === 0) return dice;
  return `${dice} ${modifier < 0 ? '-' : '+'} ${Math.abs(modifier)}`;
}

export function trayDiceCount(pool: TrayPool): number {
  return TRAY_DICE.reduce((sum, sides) => sum + (pool[sides] ?? 0), 0);
}

/** One more die of this kind, within the limits. */
export function addDie(pool: TrayPool, sides: TrayDie): TrayPool {
  const count = pool[sides] ?? 0;
  if (count >= MAX_PER_DIE || trayDiceCount(pool) >= MAX_DICE) return pool;
  return { ...pool, [sides]: count + 1 };
}

export function removeDie(pool: TrayPool, sides: TrayDie): TrayPool {
  const count = pool[sides] ?? 0;
  return count > 0 ? { ...pool, [sides]: count - 1 } : pool;
}

export function clampModifier(modifier: number): number {
  return Math.max(-MAX_MODIFIER, Math.min(MAX_MODIFIER, modifier));
}

/** The tray's dice keyed by die name (`d6`), as a roll's dice are. */
export function trayPoolByDie(pool: TrayPool): Record<string, number> {
  return Object.fromEntries(TRAY_DICE.filter((sides) => (pool[sides] ?? 0) > 0).map((sides) => [`d${sides}`, pool[sides] ?? 0]));
}
