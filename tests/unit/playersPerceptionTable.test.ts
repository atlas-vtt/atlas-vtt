// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import type { PlayerPointSight } from '../../src/app/pixi/playerPins';
import { gmTabOf } from '../../src/app/online/gm/gmTab';
import type { ObservedStore, SceneState } from '../../src/app/online/gm/atlasView';
import type { SeatSource } from '../../src/app/online/gm/seatSource';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { NotePin, TokenEntity } from '../../src/app/types';
import { SceneModelBuilder } from '../../src/app/vision/sceneModel';
import { Sprite, type Container } from 'pixi.js';
import { doorMiddle } from '../../src/app/vision/doorSight';
import { bareMapView, type BareMapView } from '../helpers/bareMapView';
import { PLAYER_SETTINGS } from './online/gm/gmLighting';
import { shareHarness, type ShareHarness } from './online/gm/shareHarness';

/*
 * What the players are shown of one lit scene of two floors, side by side: the players' frame of the GM's canvas
 * (the player window: the tokens rolls name, the outlines of sensed tokens, the door badges, the pins) and each
 * player's page at a table (the tokens, sensed outlines, doors and pins it is sent). Both read the same canvas; the
 * upper floor, which the GM does not look at, is worked out on the CPU for the page. The canvas's lighting is the
 * scene model Atlas's lighting works sight out with; whether its sight is the scene's is the test's to say.
 */

const lighting = vi.hoisted(() => ({ current: true, deps: null as SceneLightingDeps | null, built: null as unknown }));
vi.mock('../../src/app/pixi/lighting/createSceneLighting', async () => {
  const { SceneModelBuilder: Builder } = await import('../../src/app/vision/sceneModel');
  return {
    createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => {
      lighting.deps = deps;
      const builder = new Builder();
      // The sight last built: kept while the test says the lighting's sight is not the scene's.
      const model = (): ReturnType<SceneModelBuilder['update']>['model'] => {
        const state = deps.store.getState();
        if (lighting.current || lighting.built === null) lighting.built = builder.update(state, { width: 800, height: 600 }, deps.measurement, deps.rules).model;
        return lighting.built as ReturnType<SceneModelBuilder['update']>['model'];
      };
      return {
        modeLayer: { visible: false },
        isEnabled: () => deps.store.getState().lighting.enabled,
        currentSight: () => model().sight,
        sightIsCurrent: () => !deps.store.getState().lighting.enabled || lighting.current,
        lightReaches: () => model().reaches,
        ambientLight: () => model().ambient,
        refreshBounds: () => undefined,
        resetExplored: () => undefined,
        editExplored: () => false,
        beforeMapUnload: () => undefined,
        renderForFrame: <T,>(_frame: unknown, render: () => T): T => render(),
        destroy: () => undefined,
      };
    },
  };
});
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));
// The canvas's map image loads no file here: it is taken to show the level its view shows once that level is drawn.
vi.mock('../../src/app/MapController', async (original) => {
  const { MapController } = await original<typeof import('../../src/app/MapController')>();
  return { MapController: { ...MapController, showsViewedLevel: () => true } };
});

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
const CARA = 'c'.repeat(20);
const SEATS: SeatSource = { onlinePlayers: () => [ANA, BEN], ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
/** Ana also owns a hidden scout, and Cara sits at the table without a token. */
const MORE_OWNERS: Readonly<Record<string, string>> = { ...OWNERS, scout: ANA };
const MORE_SEATS: SeatSource = { onlinePlayers: () => [ANA, BEN, CARA], ownerOf: (id) => MORE_OWNERS[id], claimOf: (_map, id) => (MORE_OWNERS[id] === undefined ? null : 'taken') };
/** Whose pages are read, and on which floor each one's tokens stand. */
interface Page { readonly name: string; readonly player: string; readonly floor: string | undefined }
const PAGES: readonly Page[] = [{ name: 'ana', player: ANA, floor: undefined }, { name: 'ben', player: BEN, floor: 'upper' }];
const IMAGES = new Map(['ground', 'upper', 'roof', 'ana', 'ben', 'goblin', 'ogre', 'rat', 'ghost', 'wight'].map((name, index) => [`art/${name}.webp`, new Uint8Array([index + 1])]));
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'art/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'art/upper.webp', foreground: 'art/roof.webp' },
];
/** Sight, and a sense that reaches through walls. */
const VISION = { enabled: true, senses: [{ id: 'tremorsense', range: 30 }] } as NonNullable<TokenEntity['vision']>;
const DOOR = { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 400, y: 220 }, p2: { x: 400, y: 380 } } as WallSegment;
const WALLS: Record<string, WallSegment> = {
  north: { id: 'north', kind: 'wall', type: 'solid', p1: { x: 400, y: 0 }, p2: { x: 400, y: 220 } } as WallSegment,
  door: DOOR,
  south: { id: 'south', kind: 'wall', type: 'solid', p1: { x: 400, y: 380 }, p2: { x: 400, y: 600 } } as WallSegment,
};
const pin = (id: string, x: number, y: number): NotePin => ({ id, kind: 'pin', x, y, notePath: `Notes/${id}.md`, readable: true } as NotePin);
const PINS: Record<string, NotePin> = { hall: pin('hall', 120, 120), den: pin('den', 650, 120), nook: pin('nook', 330, 520) };
/** Committed fog over the nook, where the ogre stands. */
const FOG: FogOperation = { id: 'fog', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 280, y: 460, width: 110, height: 110 };
const creature = (id: string, x: number, y: number, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, imagePath: `art/${id}.webp`, size: 1, x, y, ...more } as TokenEntity);

/** The scene: Ana west of the wall with an ogre and a hidden ghost, a goblin beyond the door and a rat beyond the wall in her tremorsense; Ben and a wight upstairs. */
function scene(): Pick<SceneState, 'levels' | 'viewedLevel' | 'lighting' | 'heldTokens' | 'background'> & { objects: Partial<SceneState['objects']> } {
  return {
    background: 'art/ground.webp',
    levels: LEVELS, viewedLevel: 'ground', lighting: { enabled: true, ambient: 1 }, heldTokens: {},
    objects: {
      tokens: {
        ana: creature('ana', 150, 300, { vision: VISION }),
        ogre: creature('ogre', 330, 520),
        ghost: creature('ghost', 200, 160, { isHidden: true }),
        goblin: creature('goblin', 650, 300),
        rat: creature('rat', 450, 120),
        ben: creature('ben', 150, 300, { level: 'upper', vision: VISION }),
        wight: creature('wight', 650, 300, { level: 'upper' }),
      },
      walls: WALLS, pins: PINS, fog: {},
    },
  };
}

interface Rig { readonly view: BareMapView; readonly harness: ShareHarness; readonly places: PlayerPointSight }
let rig: Rig | undefined;
const NO_MARKS = { source: () => null, showPlayers: () => undefined, showPlayerDrags: () => undefined, showPlayerCursors: () => undefined, showPlayerStrokes: () => undefined };

/** How a rig differs from the first one: who sits at the table, more tokens, and whether the view is a player view, which builds no lighting. */
interface RigOptions { readonly seats?: SeatSource; readonly pages?: readonly Page[]; readonly tokens?: Readonly<Record<string, TokenEntity>>; readonly playerView?: boolean }

/** The GM's canvas over the scene, and a table on it with Ana and Ben seated (by default), each through their own character's eyes. */
async function open({ seats = SEATS, pages = PAGES, tokens = {}, playerView = false }: RigOptions = {}): Promise<Rig> {
  const placesSpy = vi.spyOn(PinRenderer.prototype, 'setPlayerSight');
  const view = await bareMapView({ whole: {}, grid: { size: 70, enabled: true, color: 0xffffff }, ...(playerView && { state: { isPlayerView: true } }) });
  const { renderer, store } = view;
  const base = scene();
  store.setState((state) => ({ ...base, objects: { ...state.objects, ...base.objects, tokens: { ...base.objects.tokens, ...tokens } } }));
  await expect.poll(() => ['ana', 'ogre', 'ghost', 'goblin', 'rat', ...Object.keys(tokens)].every((id) => renderer.getTokenRenderer()?.getTokenSprites()[id])).toBeTruthy();
  const places = placesSpy.mock.lastCall![0];
  // Atlas's own view store, which the table reads as it reads any tab's.
  const tabStore = store as unknown as ObservedStore;
  const harness = shareHarness(store.getState() as SceneState, IMAGES, seats, tabStore);
  const tabView = { app: view.obsidian, serviceManager: { getAssetService: () => null, getToolController: () => null, getEventBus: () => view.events } };
  harness.gmTab = gmTabOf({ leaf: { view: tabView } as unknown as WorkspaceLeaf, view: tabView as never, store: tabStore, renderer }, NO_MARKS);
  harness.pages.join(...pages.map(({ player }) => player));
  harness.settings = { ...PLAYER_SETTINGS, sharedVision: false };
  harness.presented = 'ground';
  harness.share.start();
  await harness.advance(2000);
  return { view, harness, places };
}
afterEach(() => {
  rig?.harness.share.stop();
  rig?.view.destroy();
  rig = undefined;
});

/** The ids of the tokens, doors or pins at the places a message names, nearest first. */
const idAt = <T extends { x: number; y: number }>(of: Readonly<Record<string, T>>, x: number, y: number): string =>
  Object.values(of).map((item) => ({ item, d: Math.hypot(item.x - x, item.y - y) })).sort((a, b) => a.d - b.d)[0]?.item['id' as keyof T] as string;

/** What the players' frame shows and each page holds now. */
function shown({ view: { renderer, store }, harness, places }: Rig, pages: readonly Page[] = PAGES): Record<string, Record<string, string[]>> {
  const state = store.getState();
  const tokens = state.objects.tokens;
  const mapPath = state.mapPath!;
  const frameTokens = renderer.getTokenRenderer()!;
  const sight = renderer.getLightingController()?.playerSight();
  const perception = frameTokens.playerFramePerception(sight);
  const ground = Object.fromEntries(Object.entries(tokens).filter(([, token]) => token.level === undefined));
  const pinPoints = Object.values(PINS);
  const seenPins = places(pinPoints.map(({ x, y }) => ({ x, y })));
  const badges = (renderer.getLightingController()?.playerOnlyLayers()[0] as Container | undefined)?.children ?? [];
  const doorAt = (x: number, y: number): string => {
    const door = Object.values(state.objects.walls).find((wall) => wall.type === 'door' && Math.hypot(doorMiddle(wall).x - x, doorMiddle(wall).y - y) < 1);
    return door === undefined ? `? ${x},${y}` : `${door.id}${door.closed === false ? ' (open)' : ''}`;
  };
  const frame = {
    tokens: [...renderer.playerRollTokens(mapPath).keys()].sort(),
    doors: badges.filter((badge) => badge instanceof Sprite).map((badge) => doorAt(badge.x, badge.y)),
    sensed: Object.keys(ground).filter((id) => !tokens[id]!.isHidden && perception?.(id) === 'sensed').sort(),
    pins: seenPins === null ? ['(none: cannot tell)'] : pinPoints.filter((_, index) => seenPins[index]).map(({ id }) => id),
  };
  const page = (player: string, floor: string | undefined): Record<string, string[]> => {
    const read = harness.pages.of(player);
    const last = <K extends 'tokens' | 'sensed' | 'doors' | 'pins'>(kind: K): ReturnType<typeof read.all<K>>[number] | undefined => read.all(kind).at(-1);
    const all = Object.fromEntries(Object.entries(tokens).filter(([, token]) => token.level === floor));
    return {
      tokens: (last('tokens')?.tokens ?? []).map((token) => idAt(all, token.x, token.y)).sort(),
      sensed: (last('sensed')?.tokens ?? []).map((token) => idAt(all, token.x, token.y)).sort(),
      doors: (last('doors')?.doors ?? []).map((door) => `${Object.values(WALLS).find((wall) => wall.p1.x === door.p[0] && wall.p1.y === door.p[1])?.id}${door.open ? ' (open)' : ''}`),
      pins: (last('pins')?.pins ?? []).map((sent) => idAt(PINS, sent.x, sent.y)).sort(),
    };
  };
  return { frame, ...Object.fromEntries(pages.map(({ name, player, floor }) => [name, page(player, floor)])) };
}

/** Changes the scene as Atlas would, tells whoever follows the lighting's sight, and lets the table send what follows. */
async function change({ view, harness }: Rig, recipe: (state: SceneState) => Partial<SceneState>): Promise<void> {
  view.store.setState((state) => recipe(state as SceneState) as never);
  const drawn = (): boolean => Object.values(view.store.getState().objects.tokens).every((token) => token.level !== undefined || view.renderer.getTokenRenderer()?.getTokenSprites()[token.id]);
  await vi.waitFor(() => expect(drawn()).toBe(true));
  lighting.deps?.onSightChange?.();
  harness.sightChanged();
  await harness.advance(2000);
}

const withTokens = (state: SceneState, changes: Record<string, Partial<TokenEntity>>): Partial<SceneState> => ({
  objects: { ...state.objects, tokens: Object.fromEntries(Object.entries(state.objects.tokens).map(([id, token]) => [id, { ...token, ...changes[id] } as TokenEntity])) },
});

describe('what players are shown of a lit scene of two floors: the players\' frame and each page', () => {
  it('follows the scene through fog, roofs, hidden and held tokens, the peek, shared vision, another floor and stale sight', async () => {
    const table = rig = await open();
    const rows: Record<string, ReturnType<typeof shown>> = {};
    rows['the door closed'] = shown(table);
    await change(table, (state) => ({ objects: { ...state.objects, walls: { ...WALLS, door: { ...DOOR, closed: false } } } }));
    rows['the door open'] = shown(table);
    await change(table, (state) => ({ objects: { ...state.objects, fog: { fog: FOG } } }));
    rows['fog over the nook'] = shown(table);
    table.view.renderer.getTokenRenderer()!.setRoofProvider((point) => point.x > 400);
    await change(table, (state) => withTokens(state, {}));
    rows['a roof drawn over the goblin\'s room, not over the party'] = shown(table);
    table.view.renderer.getTokenRenderer()!.setRoofProvider(() => false);
    await change(table, (state) => withTokens(state, { ghost: { x: 650, y: 200 } }));
    rows['the hidden ghost beside the goblin'] = shown(table);
    await change(table, (state) => ({ ...withTokens(state, { ana: { x: 600, y: 500 } }), lighting: { ...state.lighting, sightOnDrop: true }, heldTokens: { ana: { x: 150, y: 300 } } }));
    rows['the GM drags Ana with sight on drop'] = shown(table);
    await change(table, (state) => ({ ...withTokens(state, { ana: { x: 150, y: 300 } }), heldTokens: {} }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    expect(table.view.renderer.getLightingController()?.peeking()).toBe(true);
    rows['the GM peeks'] = shown(table);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h' }));
    table.harness.settings = { ...table.harness.settings, sharedVision: true };
    await table.harness.advance(2000);
    rows['shared vision on'] = shown(table);
    table.harness.settings = { ...table.harness.settings, sharedVision: false };
    await change(table, (state) => withTokens(state, { goblin: { x: 150, y: 200, level: 'upper' } }));
    rows['the goblin goes upstairs, beside Ben'] = shown(table);
    lighting.current = false;
    await change(table, (state) => {
      const back = withTokens(state, { goblin: { x: 650, y: 300, level: undefined } });
      return { objects: { ...back.objects!, walls: WALLS } };
    });
    rows['the door closes while the lighting\'s sight is not the scene\'s'] = shown(table);
    lighting.current = true;
    await change(table, (state) => withTokens(state, {}));
    rows['the lighting builds the scene again'] = shown(table);
    await change(table, (state) => ({ lighting: { ...state.lighting, enabled: false } }));
    rows['the lighting switched off'] = shown(table);
    expect(rows).toMatchSnapshot();
  });

  it('follows a hidden token a player owns, a roof over the party, a player without a token, fog over a door, and a view without lighting', async () => {
    const pages = [...PAGES, { name: 'cara', player: CARA, floor: undefined }];
    const scout = creature('scout', 250, 420, { isHidden: true, vision: VISION });
    const table = rig = await open({ seats: MORE_SEATS, pages, tokens: { scout } });
    const rows: Record<string, ReturnType<typeof shown>> = {};
    rows['Ana owns a hidden scout; Cara sits without a token'] = shown(table, pages);
    table.view.renderer.getTokenRenderer()!.setRoofProvider((point) => point.x < 400);
    await change(table, (state) => withTokens(state, {}));
    rows['a roof drawn over the party\'s room'] = shown(table, pages);
    table.view.renderer.getTokenRenderer()!.setRoofProvider(() => false);
    await change(table, (state) => ({ objects: { ...state.objects, walls: { ...WALLS, door: { ...DOOR, closed: false } }, fog: { door: { ...FOG, id: 'door', x: 370, y: 250, width: 60, height: 100 } } } }));
    rows['fog over the open door'] = shown(table, pages);
    table.harness.share.stop();
    table.view.destroy();
    const unlitView = rig = await open({ playerView: true });
    rows['a view that builds no lighting (a player view), on a lit scene'] = shown(unlitView);
    expect(rows).toMatchSnapshot();
  });
});
