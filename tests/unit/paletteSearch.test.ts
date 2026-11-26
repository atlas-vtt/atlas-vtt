import { describe, expect, it } from 'vitest';
import { searchOptions, searchScore } from '../../src/app/react/components/command-palette/paletteSearch';
import type { CommandOption } from '../../src/app/react/components/command-palette/types';

const option = (id: string, label: string, section: string, keywords?: string[]): CommandOption => ({ id, label, section, icon: null, ...(keywords && { keywords }) });

describe('searchScore', () => {
  it.each(['player view', 'player settings', 'settings player', 'players', 'play view set', 'palyer view', 'player-view'])('finds Player view settings by "%s"', (query) => {
    expect(searchScore(query, 'Player view settings')).not.toBeNull();
  });

  it('wants every word of the query', () => {
    expect(searchScore('player grid', 'Player view settings')).toBeNull();
  });

  it('allows no typo in short words, where one edit makes another word', () => {
    expect(searchScore('grit', 'Grid settings')).toBeNull();
  });

  it('finds by keywords, below a label that names the word', () => {
    const byKeyword = searchScore('cursors', 'Player view settings', ['cursors'])!;
    expect(byKeyword).toBeGreaterThan(0);
    expect(searchScore('cursors', 'Show cursors')!).toBeGreaterThan(byKeyword);
  });

  it('ignores case and accents', () => {
    expect(searchScore('HEROS', 'Héros')).not.toBeNull();
  });
});

describe('searchOptions', () => {
  const options = [
    option('pause', 'Pause player view', 'tools'),
    option('send', 'Send current map to player view', 'tools'),
    option('grid', 'Grid settings', 'settings'),
    option('pv', 'Player view settings', 'settings', ['cursors']),
  ];

  it('keeps everything in its order for an empty query', () => {
    expect(searchOptions(options, '  ').map((o) => o.id)).toEqual(['pause', 'send', 'grid', 'pv']);
  });

  it('puts the best match first, with its section ahead of the others', () => {
    expect(searchOptions(options, 'player view settings').map((o) => o.id)).toEqual(['pv']);
    expect(searchOptions(options, 'player view').map((o) => o.id)).toEqual(['pv', 'pause', 'send']);
  });
});
