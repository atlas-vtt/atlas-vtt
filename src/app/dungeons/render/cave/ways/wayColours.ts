import type { Hand } from '../../art/hand';
import type { Palette } from '../../palette';
import { stoneColours, type StoneColours } from '../../stone/colours';

/** Stone's colours for a look, worked out once per palette: the ways ask for them in every part they draw. */
const known = new WeakMap<Palette, StoneColours[]>();

/** The Stone painter's colours of the hand's look; null where the look is Engraved. */
export function stoneOf(hand: Hand): StoneColours | null {
  const { style, palette, view } = hand.scene.env;
  if (style.direction !== 'stone') return null;
  let pair = known.get(palette);
  if (!pair) known.set(palette, (pair = []));
  const k = view.monochrome ? 1 : 0;
  return (pair[k] ??= stoneColours(palette, view.monochrome));
}
