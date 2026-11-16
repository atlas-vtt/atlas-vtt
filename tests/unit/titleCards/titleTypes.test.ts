import { describe, expect, it } from 'vitest';
import { readStoredSettings } from '../../../src/app/services/atlasSettings';
import { readTitleCardLayout, readTitleCards } from '../../../src/app/titleCards/titleCardTypes';

const CARD = {
  id: 'intro',
  title: 'The Old Keep',
  subtitle: 'At the edge of the forest',
  description: 'A ruined watchtower',
  createdAt: 10,
  updatedAt: 20,
};

describe('title card settings', () => {
  it('keeps only cards with valid stored fields', () => {
    expect(readTitleCards([
      CARD,
      { id: 'broken', title: 'Missing fields' },
      { ...CARD, id: '' },
      { ...CARD, title: ' ' },
      { ...CARD, createdAt: Number.NaN },
      null,
    ])).toEqual([CARD]);
  });

  it('falls back to the list layout for unknown stored values', () => {
    expect(readTitleCardLayout('two')).toBe('two');
    expect(readTitleCardLayout('three')).toBe('three');
    expect(readTitleCardLayout('masonry')).toBe('list');
    expect(readTitleCardLayout(undefined)).toBe('list');
  });

  it('loads the title card library and layout from plugin settings', () => {
    const settings = readStoredSettings({ titleCards: [CARD], titleCardLayout: 'three' }, 'mouse').settings;
    expect(settings.titleCards).toEqual([CARD]);
    expect(settings.titleCardLayout).toBe('three');
  });
});
