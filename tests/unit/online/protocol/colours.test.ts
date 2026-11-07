import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playerColour } from '../../../../src/app/online/gm/dock/panelModel.ts';
import { PLAYER_COLOURS, playerColourVariable, playerTone } from '../../../../src/app/online/protocol/index.ts';
import { authorColour, authorTone } from '../../../../src/app/online/tableLog/logAuthors.ts';

const ids = Array.from({ length: 200 }, (_, n) => String.fromCharCode(97 + (n % 26)).repeat(19) + String.fromCharCode(97 + ((n * 7) % 26)));

describe('a player\'s colour', () => {
  it('is one of eight by the player\'s id, the same every time and for everyone', () => {
    expect(PLAYER_COLOURS).toHaveLength(8);
    expect(new Set(ids.map(playerTone)).size).toBe(PLAYER_COLOURS.length);
    for (const id of [...ids, 'x', '']) {
      expect(playerTone(id)).toBe(playerTone(id));
      expect(PLAYER_COLOURS[playerTone(id)]).toBeDefined();
      expect(playerColourVariable(id)).toBe(PLAYER_COLOURS[playerTone(id)]);
    }
    expect(playerColourVariable('gm')).toBe('--interactive-accent');
  });

  it('is the same in the GM\'s panel and in the table\'s log', () => {
    for (const id of ids) {
      expect(playerColour(id)).toBe(playerTone(id));
      expect(authorTone(id)).toBe(playerTone(id));
      expect(authorColour(id)).toBe(playerColourVariable(id));
    }
    expect(authorTone('gm')).toBe('gm');
  });

  it('has one rule in the styles, which the panel and the cursors both take their colour from', () => {
    const shared = readFileSync('src/app/online/marks/styles/_player-colours.scss', 'utf8');
    const rules = [...shared.matchAll(/\.atlas-online-colour-(\w+)\s*\{\s*--atlas-online-player:\s*var\((--[\w-]+)\);\s*\}/g)].map((match) => [match[1], match[2]]);
    expect(rules).toEqual([...PLAYER_COLOURS.map((variable, tone) => [String(tone), variable]), ['gm', '--interactive-accent']]);
    expect(readFileSync('src/app/online/gm/styles/_panel.scss', 'utf8')).not.toMatch(/--atlas-online-player:/);
    expect(readFileSync('styles/main.scss', 'utf8')).toContain('online/marks/styles/marks');
  });
});
