import { diceColourSlot } from '../extensions/slots';
import { safely } from '../extensions/SlotRegistry';
import { dieTag, type DieTag } from './diceTags';

/** The most colours the dice tray offers. */
export const MAX_DICE_COLOURS = 12;

/**
 * The colours dice of a collection can be rolled in, from every extension that offers some
 * (`dice.registerColours`), in the order they were registered: each provider asked guarded, only
 * well-formed tags kept, each colour and name once, at most `MAX_DICE_COLOURS`.
 */
export function diceColoursFor(collectionId: string | null): DieTag[] {
  if (collectionId === null) return [];
  const colours: DieTag[] = [];
  const seen = new Set<string>();
  for (const { owner, item } of diceColourSlot.list()) {
    const answer = safely(owner, 'dice colours', () => {
      const given = item(collectionId);
      // Read once and copied, inside the guard: an array whose reads throw counts as none.
      return Array.isArray(given) ? [...(given as unknown[])].map(dieTag) : [];
    }, [] as Array<DieTag | null>);
    for (const tag of answer) {
      const key = tag ? `${tag.color.toLowerCase()}|${tag.colorName}` : null;
      if (!tag || seen.has(key!)) continue;
      seen.add(key!);
      colours.push(tag);
      if (colours.length === MAX_DICE_COLOURS) return colours;
    }
  }
  return colours;
}
