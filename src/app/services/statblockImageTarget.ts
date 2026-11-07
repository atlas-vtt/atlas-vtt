/** Every statblock card Atlas shows: its own sheets, Fantasy Statblocks' renderer and their skeletons. */
const STATBLOCK_CARD = '.atlas-fantasy-statblock';

/**
 * The picture a right-click on a statblock card hit: an image of the card, or
 * the image of a token portrait whose ring lies over it. A statblock's
 * pictures are the GM's content, which may be shown to the players; anywhere
 * else in Atlas' own UI (token cards, icons, the map) this is null.
 */
export function statblockImageAt(target: Element): HTMLImageElement | null {
  if (!target.closest(STATBLOCK_CARD)) return null;
  return target.closest<HTMLImageElement>('img')
    ?? target.closest('.atlas-token-portrait')?.querySelector<HTMLImageElement>('img')
    ?? null;
}
