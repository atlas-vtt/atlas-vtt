import { parseGmMessage, type GmMessage, type SharedScene } from '../../../../src/app/online/protocol/index.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { LevelAlignment, SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { describe, expect, it } from 'vitest';
import { imageToWorld, movedWithMap, NO_STRETCH, type MapStretch } from '../../../../src/app/grid/mapStretch';
import { alignmentPlacement, levelImagePlacement } from '../../../../src/app/levels/levelAlignment';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists, type Sent, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
/** A PNG's signature and header for an image of `width` × `height`: all `imageDimensions` reads. */
const pngHeader = (width: number, height: number): Uint8Array<ArrayBuffer> => new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, width >> 8, width & 0xff, 0, 0, height >> 8, height & 0xff, 8, 6,
]);
/** The ground floor's map, 1000 × 800, and the tower's, 500 × 400. */
const IMAGE = { width: 1000, height: 800 };
const IMAGES = new Map([['maps/cave.png', pngHeader(1000, 800)], ['maps/tower.png', pngHeader(500, 400)]]);
const WIDE: MapStretch = { x: 1.5, y: 1 };
const TURNED: MapStretch = { x: 1.05724, y: 1, rotation: 1.29614 };
const START = { x: 105, y: 100 };
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };

const seats: SeatSource = { onlinePlayers: () => [ANA, BEN], ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };

/** A scene on the cave map with a grid aligned with `stretch` (as Atlas stores it; anything for a test of what Atlas would not store) and Ana's token at `at`. */
function scene(stretch?: unknown, at: { readonly x: number; readonly y: number } = START): SceneState {
  const grid = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, ...(stretch !== undefined && { mapStretch: stretch }) } as SceneState['grid'];
  return sceneState({ background: 'maps/cave.png', grid, objects: { ...sceneState().objects, tokens: { ana: token('ana', { x: at.x, y: at.y }) } } });
}

async function table(initial: SceneState, presented?: string): Promise<ShareHarness> {
  const share = shareHarness(initial, IMAGES, seats);
  share.presented = presented;
  share.share.start();
  await share.set(initial);
  await share.advance(TOKEN_INTERVAL_MS);
  return share;
}

const toPlayer = (sent: readonly Sent[], player: string): Sent[] => sent.filter(({ to }) => to === player || to === undefined);
const scenesOf = (sent: readonly Sent[]): (SharedScene | null)[] => sent.flatMap(({ body }) => (body.t === 'scene' ? [body.scene] : []));
const lastScene = (sent: readonly Sent[]): SharedScene | null => scenesOf(sent).at(-1) ?? null;
const sceneIdOf = (body: GmMessage): string | null => ('scene' in body && typeof body.scene === 'string' ? body.scene : null);
const refused = (sent: readonly Sent[]): number => sent.filter(({ body }) => body.t === 'move-refused').length;
/** What a page reads of a scene as it comes off the wire. */
const wire = (shared: SharedScene | null): SharedScene | null => {
  const read = parseGmMessage(JSON.parse(JSON.stringify({ t: 'scene', scene: shared })));
  return read?.t === 'scene' ? read.scene : null;
};

/** Moves `player`'s token `alias` of the last list they were sent. */
function move(share: ShareHarness, player: string, x: number, y: number): void {
  const list = tokenLists(toPlayer(share.sent, player)).at(-1);
  share.share.receive(player, { t: 'move', scene: list?.scene ?? '', id: list?.tokens.find((listed) => listed.id !== '')?.id ?? '', x, y });
}

describe('the stretch of a shared map', () => {
  it('goes out beside the map, as the page reads it', async () => {
    for (const stretch of [WIDE, TURNED]) {
      const share = await table(scene(stretch));
      const sent = lastScene(share.sent);
      expect(sent?.stretch).toEqual(stretch);
      expect(sent?.fit).toBeUndefined();
      expect(wire(sent)?.stretch).toEqual(stretch);
    }
  });

  it('is left out for a map drawn as it is, so such a scene goes out as it always did', async () => {
    // No stretch, a level one, a grid without the field, and what Atlas itself reads as none.
    for (const stretch of [undefined, { x: 1, y: 1 }, { x: 1, y: 1, rotation: 0 }, { x: 2, y: 1 }, { x: 1.1, y: 1, rotation: 30 }, 'wide', { x: Number.NaN, y: 1 }]) {
      const share = await table(scene(stretch));
      expect(Object.keys(lastScene(share.sent) ?? {}), JSON.stringify(stretch)).toEqual(['id', 'map', 'lit']);
    }
    const ungridded = await table(sceneState({ background: 'maps/cave.png', grid: null }));
    expect(Object.keys(lastScene(ungridded.sent) ?? {})).toEqual(['id', 'map', 'lit']);
  });

  it('is left out for a scene without a map image, whatever its grid says', async () => {
    const share = await table({ ...scene(WIDE), background: null });
    expect(lastScene(share.sent)).toEqual({ id: expect.any(String) as string, map: null, lit: false });
  });
});

describe('a stretch that changes while the table is open', () => {
  it('starts another scene: nothing of the new world goes out under the old scene, and the stretch comes before everything that lies in it', async () => {
    const share = await table(scene());
    const before = lastScene(share.sent);
    expect(tokenLists(share.sent).at(-1)?.tokens.map((entry) => [entry.x, entry.y])).toEqual([[START.x, START.y]]);
    const mark = share.sent.length;

    // The GM applies an alignment: Atlas writes the grid and every object moved with the map in one write.
    const moved = movedWithMap(IMAGE, NO_STRETCH, TURNED)(START);
    expect(Math.hypot(moved.x - START.x, moved.y - START.y)).toBeGreaterThan(10);
    await share.set(scene(TURNED, moved));
    await share.advance(TOKEN_INTERVAL_MS);

    const after = share.sent.slice(mark);
    const next = lastScene(share.sent);
    expect(next?.stretch).toEqual(TURNED);
    expect(next?.id).not.toBe(before?.id);
    expect(next?.map).toEqual(before?.map);
    expect(after.filter(({ body }) => sceneIdOf(body) === before?.id)).toEqual([]);
    expect(after[0]?.body).toEqual({ t: 'scene', scene: next });
    const lists = after.flatMap(({ body }) => (body.t === 'tokens' ? [body] : []));
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((list) => list.scene === next?.id)).toBe(true);
    const [listed] = lists.at(-1)?.tokens ?? [];
    expect(Math.hypot((listed?.x ?? 0) - moved.x, (listed?.y ?? 0) - moved.y)).toBeLessThan(0.01);
    expect(after.some(({ body }) => body.t === 'delta')).toBe(false);
  });

  it('starts another scene again when the GM takes the alignment back, with the map drawn as it is', async () => {
    const share = await table(scene(WIDE, { x: 400, y: 100 }));
    const stretched = lastScene(share.sent);
    await share.set(scene(undefined, START));
    await share.advance(TOKEN_INTERVAL_MS);
    const back = lastScene(share.sent);
    expect(back?.id).not.toBe(stretched?.id);
    expect(back !== null && 'stretch' in back).toBe(false);
    expect(tokenLists(share.sent).at(-1)).toMatchObject({ scene: back?.id, tokens: [{ x: 105 }] });
  });

  it('keeps the scene while the grid changes in any other way', async () => {
    const share = await table(scene(WIDE));
    const before = lastScene(share.sent);
    const state = scene(WIDE);
    await share.set({ ...state, grid: state.grid === null ? null : { ...state.grid, size: 64, offsetX: 3, mapStretch: { ...WIDE } } });
    await share.advance(TOKEN_INTERVAL_MS);
    expect(scenesOf(share.sent)).toEqual([before]);
  });
});

describe("players' moves on a stretched map", () => {
  it('are kept on the map as it is drawn: the far strip a stretch adds is on it, and what lies beyond is not', async () => {
    const share = await table(scene(WIDE));
    move(share, ANA, 1400, 300);
    await share.advance(TOKEN_INTERVAL_MS);
    expect(refused(share.sent)).toBe(0);
    expect(tokenLists(share.sent).at(-1)?.tokens[0]).toMatchObject({ x: 1400, y: 300 });
    move(share, ANA, 1501, 300);
    expect(refused(share.sent)).toBe(1);

    const level = await table(scene());
    move(level, ANA, 1400, 300);
    expect(refused(level.sent)).toBe(1);
  });

  it('reach the corner of the box that holds a turned map, where the image itself ends short of it', async () => {
    const share = await table(scene(TURNED));
    const corner = imageToWorld({ x: IMAGE.width, y: IMAGE.height }, IMAGE, TURNED);
    expect(corner.x).toBeGreaterThan(IMAGE.width);
    move(share, ANA, corner.x - 1, corner.y - 20);
    await share.advance(TOKEN_INTERVAL_MS);
    expect(refused(share.sent)).toBe(0);
    move(share, ANA, corner.x + 40, corner.y - 20);
    expect(refused(share.sent)).toBe(1);
  });
});

describe('the floors of a scene with a stretched map', () => {
  const LEVELS: SceneLevel[] = [
    { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/cave.png' },
    { id: 'tower', name: 'Tower', elevation: { bottom: 10, top: 20 }, background: 'maps/tower.png' },
  ];
  /** The tower drawn twice its size, a little turned, from 100 px in: its world is 100 + 1000 × 1.1 wide. */
  const TOWER: LevelAlignment = { scale: 2, offset: { x: 100, y: 0 }, stretch: { x: 1.1, y: 1, rotation: 1 } };

  /** Ana on the ground, Ben in the tower; the scene's grid stretched by `stretch`, the tower fitted by `tower` where given. */
  function floors(stretch: MapStretch, tower?: LevelAlignment, ben: { readonly x: number; readonly y: number } = START): SceneState {
    const state = scene(stretch);
    const tokens: Record<string, TokenEntity> = { ana: token('ana', START), ben: token('ben', { ...ben, level: 'tower' }) };
    return { ...state, levels: LEVELS, viewedLevel: 'ground', ...(tower !== undefined && { levelAlignments: { tower } }), objects: { ...state.objects, tokens } };
  }

  it('sends each floor drawn in the scene\'s frame the scene\'s stretch', async () => {
    const share = await table(floors(WIDE), 'ground');
    expect(lastScene(toPlayer(share.sent, ANA))).toMatchObject({ stretch: WIDE, floor: { level: 0 } });
    expect(lastScene(toPlayer(share.sent, BEN))).toMatchObject({ stretch: WIDE, floor: { level: 1 } });
    expect(lastScene(toPlayer(share.sent, BEN))?.fit).toBeUndefined();
  });

  it('sends a fitted floor its own stretch and fit, from which the page draws it exactly as Atlas does', async () => {
    const state = floors(WIDE, TOWER);
    const share = await table(state, 'ground');
    const tower = wire(lastScene(toPlayer(share.sent, BEN)));
    expect(tower).toMatchObject({ stretch: TOWER.stretch, fit: { scale: TOWER.scale, offset: TOWER.offset }, floor: { level: 1 } });
    expect(lastScene(toPlayer(share.sent, ANA))).toMatchObject({ stretch: WIDE });
    // What the page puts together of the fields is Atlas's own placement of that floor.
    const placed = alignmentPlacement({ scale: tower?.fit?.scale ?? 0, offset: tower?.fit?.offset ?? { x: 0, y: 0 }, stretch: tower?.stretch ?? NO_STRETCH });
    expect(placed).toEqual(levelImagePlacement(state, 'tower'));
  });

  it('sends a fitted floor its fit also where its own image is drawn unstretched, so the scene\'s stretch never reaches it', async () => {
    const share = await table(floors(WIDE, { scale: 1, offset: { x: 0, y: 0 }, stretch: NO_STRETCH }), 'ground');
    const tower = lastScene(toPlayer(share.sent, BEN));
    expect(tower?.fit).toEqual({ scale: 1, offset: { x: 0, y: 0 } });
    expect(tower?.stretch).toBeUndefined();
  });

  it('starts another scene for the floor fitted anew alone: the other floor keeps its own', async () => {
    const share = await table(floors(WIDE, TOWER), 'ground');
    const ground = lastScene(toPlayer(share.sent, ANA));
    const tower = lastScene(toPlayer(share.sent, BEN));
    const mark = share.sent.length;
    await share.set(floors(WIDE, { ...TOWER, scale: 1.5 }));
    await share.advance(TOKEN_INTERVAL_MS);
    const after = share.sent.slice(mark);
    expect(scenesOf(toPlayer(after, ANA))).toEqual([]);
    expect(lastScene(toPlayer(share.sent, ANA))).toEqual(ground);
    const refitted = lastScene(toPlayer(after, BEN));
    expect(refitted?.id).not.toBe(tower?.id);
    expect(refitted?.fit?.scale).toBe(1.5);
  });

  it('keeps a player\'s moves on a fitted floor\'s own world', async () => {
    const share = await table(floors(NO_STRETCH, TOWER), 'ground');
    // 100 px in, then the 500 px image twice its size, stretched a tenth and turned: past the frame's 1000 px.
    move(share, BEN, 1150, 300);
    await share.advance(TOKEN_INTERVAL_MS);
    expect(refused(share.sent)).toBe(0);
    move(share, BEN, 1300, 300);
    expect(refused(share.sent)).toBe(1);
  });
});
