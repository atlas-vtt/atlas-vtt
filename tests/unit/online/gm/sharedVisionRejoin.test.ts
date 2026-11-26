import type { NotePin, TokenEntity } from '../../../../src/app/types';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { MapLayerSource } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import { describe, expect, it } from 'vitest';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import type { PlayerPage } from './playerPages.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

/**
 * The relay's welcome when the GM's Atlas comes back to a running table: the players are still connected,
 * and the scene goes out again before the GM has worked out whose eyes each of them sees through. A message
 * without an addressee reaches every connected page, so without Shared vision nothing of anyone's view may go
 * out that way, not even for the moment until the players are placed.
 */

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const WALLS: Record<string, WallSegment> = {
  between: { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } } as WallSegment,
  door: { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 1000, y: 100 }, p2: { x: 1000, y: 300 } } as WallSegment,
};
const DEN: NotePin = { id: 'den', kind: 'pin', x: 950, y: 250, notePath: 'Notes/Den.md', readable: true } as NotePin;
const partyLayers: MapLayerSource = { grid: () => null, rules: () => null, doorsSeen: () => new Set(['door']), pointsSeen: (points) => points.map(() => true), sensed: () => [] };

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

/** A dark scene of two rooms: Ana with a rat in hers, Ben with a goblin, a door and a readable pin in his. */
function rooms(): SceneState {
  const tokens: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300 }),
  };
  const state = sceneState({ lighting: { enabled: true, ambient: 0 } });
  return { ...state, objects: { ...state.objects, walls: WALLS, tokens, pins: { den: DEN } } };
}

/** A table whose players are connected but not yet placed by the GM; `place` seats them, as the welcome's ownership step does. */
async function rejoined(sharedVision: boolean): Promise<{ readonly table: ShareHarness; place(): Promise<void> }> {
  let online: string[] = [];
  const seats: SeatSource = { onlinePlayers: () => online, ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
  const state = rooms();
  const table = shareHarness(state, IMAGES, seats);
  // Their pages are connected all along: the relay hands them what goes to all.
  table.pages.join(ANA, BEN);
  table.settings = { ...PLAYER_SETTINGS, sharedVision };
  table.layers = partyLayers;
  table.perception = gmPerception(state, GENERIC_SOURCE, MAP);
  table.share.start();
  await table.set(state);
  table.share.resend();
  await table.advance(1000);
  const place = async (): Promise<void> => {
    online = [ANA, BEN];
    table.share.ownersChanged();
    await table.advance(1000);
  };
  return { table, place };
}

const names = (page: PlayerPage): string[] => page.tokens.map((entry) => entry.name ?? '?').sort();
const seers = (page: PlayerPage): number[] => page.all('sight').flatMap((message) => message.tokens.map(({ x }) => x));
const doors = (page: PlayerPage): number => page.last('doors')?.doors.length ?? 0;

describe('a table the GM comes back to', () => {
  it('sends nobody anything of a view without Shared vision before it has placed its players', async () => {
    const { table } = await rejoined(false);
    for (const page of [table.pages.of(ANA), table.pages.of(BEN)]) {
      expect(names(page)).toEqual([]);
      expect(seers(page)).toEqual([]);
      expect(doors(page)).toBe(0);
      expect(JSON.stringify(page.inbox)).not.toContain('Notes/Den.md');
    }
  });

  it('then sends each player their own view once they are placed', async () => {
    const { table, place } = await rejoined(false);
    await place();
    expect(names(table.pages.of(ANA))).toEqual(['Ana', 'Rat']);
    expect(names(table.pages.of(BEN))).toEqual(['Ben', 'Goblin']);
    expect(doors(table.pages.of(ANA))).toBe(0);
    expect(doors(table.pages.of(BEN))).toBe(1);
  });

  it('under Shared vision sends the party\'s view to every page at once, a page not placed yet too', async () => {
    const { table } = await rejoined(true);
    expect(names(table.pages.of(ANA))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
    expect(names(table.pages.of(BEN))).toEqual(['Ana', 'Ben', 'Goblin', 'Rat']);
  });
});
