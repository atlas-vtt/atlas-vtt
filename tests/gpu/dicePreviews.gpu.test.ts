import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { DICE_COLOUR_OPTIONS } from '../../src/app/dice3d/diceLook';
import { cachedDicePreviews, fillDicePreviews, subscribeDicePreviews } from '../../src/app/dice3d/dicePreviews';

const ALL_COLOURS = DICE_COLOUR_OPTIONS.map((option) => option.value);

// In order, sharing the session's previews: the first two run before any stage of the document exists.
describe('the dice colour previews', () => {
  it('are not rendered ahead where no stage waits for a roll', async () => {
    await fillDicePreviews('medieval', 'ifStage');
    expect(cachedDicePreviews('medieval')).toBeNull();
    expect(cachedDicePreviews('scifi')).toBeNull();
  });

  it('come as whole sets, the shown font first and then the other, for a change of look', async () => {
    const seen: { medieval: number | null; scifiWhenMedievalCame: boolean | null } = { medieval: null, scifiWhenMedievalCame: null };
    const counts = new Set<number>();
    const unsubscribe = subscribeDicePreviews(() => {
      const medieval = cachedDicePreviews('medieval');
      counts.add(Object.keys(medieval?.images ?? {}).length);
      if (medieval && seen.medieval === null) {
        seen.medieval = Object.keys(medieval.images).length;
        seen.scifiWhenMedievalCame = cachedDicePreviews('scifi') !== null;
      }
    });
    await fillDicePreviews('medieval', 'shown');
    unsubscribe();
    // Never part of a set: none, or every colour.
    expect([...counts].sort((a, b) => a - b)).toEqual([0, ALL_COLOURS.length]);
    expect(seen.scifiWhenMedievalCame).toBe(false);
    expect(Object.keys(cachedDicePreviews('scifi')?.images ?? {})).toEqual(ALL_COLOURS);
  });

  it('show a preset picked as the accent at once, though Obsidian hands it back a unit off', () => {
    // Teal (#2a9d8f) as Obsidian keeps it: #2a9d90.
    document.body.style.setProperty('--interactive-accent', 'hsl(173, 58%, 39%)');
    const previews = cachedDicePreviews('medieval');
    expect(previews, 'the whole set, with no die to render').not.toBeNull();
    expect(previews!.images.accent).toBe(previews!.images.teal);
    document.body.style.removeProperty('--interactive-accent');
  });

  it('render a new accent colour\'s die ahead into a waiting stage, so a panel opens with the whole set', async () => {
    document.body.style.setProperty('--interactive-accent', '#1e7a4c');
    expect(cachedDicePreviews('medieval')).toBeNull();
    await fillDicePreviews('medieval', 'ifStage');
    expect(Object.keys(cachedDicePreviews('medieval')?.images ?? {})).toEqual(ALL_COLOURS);
    document.body.style.removeProperty('--interactive-accent');
  });
});
