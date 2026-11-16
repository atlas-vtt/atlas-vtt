import { describe, expect, it } from 'vitest';
import { linkName, MAX_PIN_NAME, pinName, showsPinName } from '../../src/app/tools/pinNames';
import { uncoveredLabels } from '../../src/app/utils/labelDeclutter';

describe('a pin\'s name', () => {
  it('is its note\'s name without the extension, or the heading it links', () => {
    expect(linkName('Places/Saltmarsh.md')).toBe('Saltmarsh');
    expect(linkName('Places/Saltmarsh.md#The Sea Wall')).toBe('The Sea Wall');
    expect(linkName('Scenes/Keep.atlasmap')).toBe('Keep');
    expect(linkName('Encounters/Forest/')).toBe('Forest');
  });

  it('is the GM\'s where the GM named it, trimmed and cut short, and the note\'s once emptied', () => {
    expect(pinName({ notePath: 'Places/Saltmarsh.md', name: '  Old harbour ' })).toBe('Old harbour');
    expect(pinName({ notePath: 'Places/Saltmarsh.md', name: '   ' })).toBe('Saltmarsh');
    expect(pinName({ notePath: 'a.md', name: 'x'.repeat(200) })).toHaveLength(MAX_PIN_NAME);
  });

  it('reads a map file that holds something else as no name of its own', () => {
    expect(pinName({ notePath: 'Places/Saltmarsh.md', name: 7 as unknown as string })).toBe('Saltmarsh');
  });

  it('shows only where switched on and not empty', () => {
    expect(showsPinName({ notePath: 'a.md', showName: true })).toBe(true);
    expect(showsPinName({ notePath: 'a.md' })).toBe(false);
    expect(showsPinName({ notePath: '', showName: true })).toBe(false);
  });
});

describe('names that crowd', () => {
  const box = (id: string, left: number, top = 0, width = 10, height = 4) => ({ id, left, top, right: left + width, bottom: top + height });

  it('shows names in order, each that covers no name shown before it', () => {
    expect([...uncoveredLabels([box('a', 0), box('b', 5), box('c', 12)])]).toEqual(['a', 'c']);
  });

  it('hides a name over another pin, but never for its own', () => {
    const markers = [box('a', 0, -6, 6, 6), box('b', 2, 1, 4, 4)];
    expect([...uncoveredLabels([box('a', 0)], markers)]).toEqual([]);
    expect([...uncoveredLabels([box('a', 0)], [box('a', 0, 0, 10, 4)])]).toEqual(['a']);
  });

  it('shows them all once zooming in spreads them apart', () => {
    expect(uncoveredLabels([box('a', 0), box('b', 20), box('c', 40)]).size).toBe(3);
  });
});
