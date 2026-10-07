import { diceColourSlot } from '../app/extensions/slots';
import type { DisposerSet } from './disposers';
import type { Disposer } from './types/common';
import type { DiceApi, DiceColour } from './types/dice';

/** `dice.registerColours` for one extension: the provider goes into the tray's slot, removed with the extension. */
export function registerColoursFor(extensionId: string, disposers: DisposerSet): NonNullable<DiceApi['registerColours']> {
  return (provider: (collectionId: string) => readonly DiceColour[]): Disposer => {
    if (typeof provider !== 'function') throw new Error('[Atlas API] dice.registerColours needs a function.');
    return disposers.add(diceColourSlot.add(extensionId, (collectionId: string) => provider(collectionId)));
  };
}
