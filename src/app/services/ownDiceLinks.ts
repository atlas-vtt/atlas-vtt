/** Set by the statblock renderer on the line that holds a creature's hit points. */
export const HIT_POINTS_SELECTOR = '[data-hit-points]';

/**
 * The roll links Atlas's own dice code made (`createDiceLink`, `diceLinkProps`). An element of the same class and
 * attributes that a note's raw HTML or a layout's script made is not among them.
 */
const made = new WeakSet<Element>();

/** Counts `link` as one Atlas made; a ref callback, so it takes the null React hands it when the link goes. */
export function markOwnDiceLink(link: Element | null): void {
  if (link) made.add(link);
}

export function isOwnDiceLink(element: Element): boolean {
  return made.has(element);
}

/** Dice on the hit points line: a click on them rolls the creature's hit points onto its tokens (`rollHitPoints`). */
export function isHitDice(link: Element): boolean {
  return /d\d/i.test(link.getAttribute('data-formula') ?? '') && link.closest(HIT_POINTS_SELECTOR) !== null;
}
