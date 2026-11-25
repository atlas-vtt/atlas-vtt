import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { DICE_COLOUR_OPTIONS } from '../../src/app/dice3d/diceLook';
import { cachedDicePreviews, fillDicePreviews } from '../../src/app/dice3d/dicePreviews';

const ALL_COLOURS = DICE_COLOUR_OPTIONS.map((option) => option.value);

// In order: the first two run before any stage of the document exists.
describe('the dice colour previews', () => {
  it('are not rendered ahead where no stage waits for a roll', async () => {
    await fillDicePreviews('medieval', false);
    expect(cachedDicePreviews('medieval')).toEqual({ images: {}, ring: null });
  });

  it('are rendered for a panel that shows them, stage or not, and kept', async () => {
    await fillDicePreviews('scifi', true);
    const previews = cachedDicePreviews('scifi');
    expect(Object.keys(previews.images)).toEqual(ALL_COLOURS);
    expect(previews.ring).not.toBeNull();
  });

  it('are rendered ahead into a waiting stage, so a panel opens with them', async () => {
    await fillDicePreviews('medieval', false);
    expect(Object.keys(cachedDicePreviews('medieval').images)).toEqual(ALL_COLOURS);
  });
});
