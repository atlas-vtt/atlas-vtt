import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOWN_IMAGE_LAYOUT, readShownImageLayout } from '../../src/app/services/shownImageLayout';

describe('size and place of an image displayed to the players', () => {
  it('reads sizes in range and places it knows, and the default for anything else', () => {
    expect(readShownImageLayout(undefined)).toEqual(DEFAULT_SHOWN_IMAGE_LAYOUT);
    expect(readShownImageLayout({ size: 0.5, place: 'top-left' })).toEqual({ size: 0.5, place: 'top-left' });
    // A newer field is kept
    expect(readShownImageLayout({ size: 0.42, place: 'bottom', later: 1 })).toEqual({ size: 0.42, place: 'bottom', later: 1 });
    expect(readShownImageLayout({ size: 0.2, place: 'middle' })).toEqual(DEFAULT_SHOWN_IMAGE_LAYOUT);
    expect(readShownImageLayout({ size: Number.NaN })).toEqual(DEFAULT_SHOWN_IMAGE_LAYOUT);
  });

  it('defaults to what players saw before: centred, at most nine tenths of the view', () => {
    expect(DEFAULT_SHOWN_IMAGE_LAYOUT).toEqual({ size: 0.9, place: 'center' });
  });
});
