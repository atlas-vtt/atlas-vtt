/**
 * Dice looks other than the one in effect: a collection's choice (`dice.useLook`) paints the dice of
 * that collection's maps while the GM's default paints the rest. A stage asks for the look of its
 * roll's map (`DiceScene.lookId`) and gets a variant to paint with (`dieVariantAssets`), or null for
 * the look in effect. A look whose extension is not loaded, or whose art is still loading, gives the
 * look in effect meanwhile; its art is loaded once asked for, so the next throw has it.
 */

import { lookArt, type LookArt } from './customLookArt';
import { customLook, type CustomDiceLook } from './customLooks';
import { DEFAULT_DICE_LOOK, type DiceLook, type Rgb } from './diceLook';
import type { LookVariant } from './dieMesh';
import { activeLook, resolveCustomLook, resolveLook } from './dieSkin';

/** The GM's colour and numbers and the accent they were last applied with (`applyDiceLook`): what every variant builds on. */
let base: { look: DiceLook; accent: Rgb | null } = { look: DEFAULT_DICE_LOOK, accent: null };

export function setVariantBase(look: DiceLook, accent: Rgb | null): void {
  base = { look, accent };
}

const readyArt = new WeakMap<CustomDiceLook, LookArt>();
/** A number per registration, so a look registered again paints from its new art. */
const registrations = new WeakMap<CustomDiceLook, number>();
let registrationCount = 0;

function registrationOf(look: CustomDiceLook): number {
  let id = registrations.get(look);
  if (id === undefined) {
    id = ++registrationCount;
    registrations.set(look, id);
  }
  return id;
}

const baseKey = (): string => `${base.look.colour}:${base.look.font}:${base.accent?.join(',') ?? ''}`;

/** Atlas's own dice in the GM's colour and numbers. */
export function atlasVariant(): LookVariant {
  const own = resolveLook(base.look, base.accent);
  return { key: `atlas#${baseKey()}`, look: () => own };
}

/** An extension's look with its loaded art, over the GM's numbers. */
export function customVariant(custom: CustomDiceLook, art: LookArt): LookVariant {
  const resolved = resolveCustomLook(base.look, custom, art);
  return { key: `${custom.id}#${registrationOf(custom)}#${baseKey()}`, look: () => resolved };
}

/** The GM's numbers font, which every variant's fallback numerals use. */
export function variantFont(): DiceLook['font'] {
  return base.look.font;
}

/**
 * The look to paint a stage in for the choice `lookId` (a full look id, `''` for Atlas's own dice, undefined for
 * no choice): null for the look in effect, and meanwhile for a look not registered or whose art is still loading.
 */
export function lookVariant(lookId: string | null | undefined): LookVariant | null {
  if (lookId === null || lookId === undefined) return null;
  if (lookId === (activeLook().lookId ?? '')) return null;
  if (lookId === '') return atlasVariant();
  const custom = customLook(lookId);
  if (!custom) return null;
  const art = readyArt.get(custom);
  if (!art) {
    void lookArt(custom).then((loaded) => { readyArt.set(custom, loaded); });
    return null;
  }
  return customVariant(custom, art);
}
