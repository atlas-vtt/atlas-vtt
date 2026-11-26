import { produce } from 'immer';
import { FogCoverageCache } from '../../../../src/app/fog/FogCoverageCache';
import { describe, expect, it } from 'vitest';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { MAX_LIVE_PEN_POINTS, PlayerStrokes, STROKE_SILENCE_MS } from '../../../../src/app/online/gm/playerStrokes.ts';
import { clearDrawnBy } from '../../../../src/app/online/gm/playerDrawingsClear.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import { TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import {
  MARKS_INTERVAL_MS, MAX_PLAYER_SEE_THROUGH_POINTS, MAX_PLAYER_STROKE_POINTS, parsePlayerMessage,
  type DrawLook, type GmMessage, type MarksMessage, type PlayerStroke, type SharedStroke,
} from '../../../../src/app/online/protocol/index.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE, PLAYER_SETTINGS } from './gmLighting.ts';
import { sceneState, shareHarness, type Sent, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CELL = 70;
const LOOK: DrawLook = { colour: '#e93147', size: 'm' };
const GRID = { enabled: true, size: CELL, offsetX: 0, offsetY: 0, opacity: 1 } as SceneState['grid'];
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]);
const DRAWING = { ...PLAYER_SETTINGS, playersDraw: true };
const SEATS: SeatSource = { onlinePlayers: () => [ANA, BEN], ownerOf: () => undefined, claimOf: () => null };

const ofKind = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): (Sent & { body: Extract<GmMessage, { t: T }> })[] =>
  sent.filter((entry): entry is Sent & { body: Extract<GmMessage, { t: T }> } => entry.body.t === t);
const sceneId = (table: ShareHarness): string => ofKind(table.sent, 'scene').at(-1)?.body.scene?.id ?? '';
const lastMarks = (table: ShareHarness): MarksMessage | undefined => ofKind(table.sent, 'marks').at(-1)?.body;
const strokes = (table: ShareHarness): readonly SharedStroke[] => lastMarks(table)?.strokes ?? [];

async function started(): Promise<ShareHarness> {
  const state = sceneState({ grid: GRID });
  const table = shareHarness(state, IMAGES, SEATS);
  table.settings = DRAWING;
  table.layers = fakeLayers({ state: () => table.state(), source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, grid: () => null, collections: null });
  table.share.start();
  await table.set(state);
  await table.advance(TOKEN_POLL_MS);
  return table;
}

let requests = 0;
const next = (): number => (requests += 1);
/** Hands the GM a drawing under way as it would arrive: through the protocol's own reader. */
function tells(table: ShareHarness, from: string, stroke: Omit<PlayerStroke, 't' | 'scene'>): void {
  const read = parsePlayerMessage(JSON.parse(JSON.stringify({ t: 'stroke', scene: sceneId(table), ...stroke })));
  if (read === null) throw new Error('the protocol refuses the stroke');
  table.share.receive(from, read);
}
/** A filled sheet over the whole map: what one message of a page can ask everyone to be shown. */
const sheet = (n: number): Omit<PlayerStroke, 't' | 'scene'> => ({ n, mode: 'rectangle', pts: [0, 0, 2000, 2000], look: { colour: '#000000', size: 'xl', fill: 'solid' } });

describe('how long a drawing a player is making is shown', () => {
  it('goes once its maker\'s page has said nothing of it for a few seconds, and stays while the page keeps telling of it', async () => {
    const table = await started();
    const n = next();
    tells(table, ANA, sheet(n));
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table)).toHaveLength(1);
    // A page that still holds the shape says so every second.
    for (let second = 0; second < 5; second += 1) {
      await table.advance(1000);
      tells(table, ANA, sheet(n));
    }
    expect(strokes(table)).toHaveLength(1);
    // Then nothing more: no word that it was dropped, no request to make it.
    await table.advance(STROKE_SILENCE_MS + 2 * TOKEN_POLL_MS);
    expect(strokes(table)).toEqual([]);
  });

  it('goes at once when the GM no longer lets players draw', async () => {
    const table = await started();
    tells(table, ANA, sheet(next()));
    tells(table, BEN, { n: next(), mode: 'line', pts: [0, 0, 50, 50], look: LOOK });
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table)).toHaveLength(2);
    table.settings = { ...DRAWING, playersDraw: false };
    await table.advance(TOKEN_POLL_MS + MARKS_INTERVAL_MS);
    expect(strokes(table)).toEqual([]);
  });

  it('goes when the GM clears what its maker drew, and stays when the maker removes their own', async () => {
    const table = await started();
    const scene = sceneId(table);
    const add = (from: string): void => table.share.receive(from, { t: 'draw-add', scene, n: next(), mode: 'pen', pts: [100, 100, 200, 100], look: LOOK });
    add(ANA);
    add(BEN);
    await table.advance(MARKS_INTERVAL_MS + 1100);
    tells(table, ANA, sheet(next()));
    tells(table, BEN, sheet(next()));
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table).map(({ who }) => who).sort()).toEqual([ANA, BEN]);
    // The dock's "Clear this player's drawings": one write of the GM's store.
    const store: SceneStore = { getState: () => table.state(), setState: (recipe) => void table.set(produce(table.state(), recipe)), subscribe: () => () => undefined };
    expect(clearDrawnBy(store, ANA)).toBe(1);
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table).map(({ who }) => who)).toEqual([BEN]);
    // Ben takes his own drawing off the map: what he is drawing stays.
    const mine = ofKind(table.sent, 'draw-mine').filter(({ to }) => to === BEN).at(-1)?.body.drawings[0]?.id ?? '';
    table.share.receive(BEN, { t: 'draw-remove', scene, n: next(), ids: [mine] });
    await table.advance(MARKS_INTERVAL_MS);
    expect(Object.values(table.state().objects.drawings)).toHaveLength(0);
    expect(strokes(table).map(({ who }) => who)).toEqual([BEN]);
    // The Draw tool's Clear of the players' drawings, with one of Ben's on the map again.
    add(BEN);
    await table.advance(MARKS_INTERVAL_MS + 1100);
    tells(table, BEN, sheet(next()));
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table).map(({ who }) => who)).toEqual([BEN]);
    await table.set(produce(table.state(), (draft) => {
      for (const [id, drawing] of Object.entries(draft.objects.drawings)) if (typeof drawing.by === 'string') delete draft.objects.drawings[id];
    }));
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table)).toEqual([]);
  });
});

describe('what a drawing a player is making may show', () => {
  it('shows no fill of a line before it is made, and nothing of a line that could not be made', async () => {
    const table = await started();
    tells(table, ANA, { n: next(), mode: 'line', pts: [0, 0, 300, 0, 300, 300], closed: true, look: { ...LOOK, fill: 'solid' } });
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table)[0]?.drawings[0]).not.toHaveProperty('fill');
    // See-through ink in more points than a player's may have: whoever showed it would work out its outline with every message.
    const many = Array.from({ length: MAX_PLAYER_SEE_THROUGH_POINTS + 1 }, (_, index) => [100 + index * 9, 300 + (index % 2) * 40]).flat();
    tells(table, ANA, { n: next(), mode: 'line', pts: many, look: { ...LOOK, seeThrough: true } });
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table)).toEqual([]);
  });

  it('is not followed off the map, as no drawing is made there', () => {
    const held = new PlayerStrokes();
    const fog = new FogCoverageCache().get({}, 'maps/cave.webp');
    const map = { width: 2000, height: 2000 };
    const box = (to: number): PlayerStroke => ({ t: 'stroke', scene: 's', n: 1, mode: 'rectangle', pts: [0, 0, to, to], look: { ...LOOK, fill: 'solid' } });
    held.receive(ANA, box(2000 + 2 * CELL), CELL, map, 0);
    expect(held.take(fog, 0)).toHaveLength(1);
    held.receive(ANA, box(2000 + 2 * CELL + 1), CELL, map, 100);
    expect(held.take(fog, 100)).toEqual([]);
  });

  it('stands still once a pen has come to as many points as a stroke may have', async () => {
    const table = await started();
    const n = next();
    expect(MAX_LIVE_PEN_POINTS).toBe(MAX_PLAYER_STROKE_POINTS);
    const point = (index: number): number[] => [index % 1900, 100 + Math.floor(index / 1900) * 5 + (index % 2)];
    let told = 0;
    for (let from = 0; from < MAX_PLAYER_STROKE_POINTS; from += 200) {
      tells(table, ANA, { n, mode: 'pen', pts: Array.from({ length: 200 }, (_, index) => point(from + index)).flat(), from, look: LOOK });
      await table.advance(MARKS_INTERVAL_MS);
      told = Math.max(told, (strokes(table)[0]?.from ?? 0) + (strokes(table)[0]?.drawings[0]?.points.length ?? 0) / 2);
    }
    expect(told).toBe(MAX_PLAYER_STROKE_POINTS);
    // The page's last word, which names the stroke's last point again: it is still shown, at its end.
    tells(table, ANA, { n, mode: 'pen', pts: point(MAX_PLAYER_STROKE_POINTS - 1), from: MAX_PLAYER_STROKE_POINTS - 1, look: LOOK });
    await table.advance(MARKS_INTERVAL_MS);
    expect(strokes(table)).toHaveLength(1);
    // A page that draws on tells of points the protocol does not count to.
    expect(parsePlayerMessage({ t: 'stroke', scene: sceneId(table), n, mode: 'pen', pts: [1, 1], from: MAX_PLAYER_STROKE_POINTS + 1, look: LOOK })).toBeNull();
  });
});
