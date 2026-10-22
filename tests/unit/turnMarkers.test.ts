import { Container, Sprite, Ticker } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { TurnMarkers, type TurnMarkerState } from '../../src/app/pixi/token-renderer/turnMarker/TurnMarkers';
import { MAP_LAYER_Z } from '../../src/app/pixi/mapLayerOrder';
import { TOKEN_UI_Z_INDEX } from '../../src/app/pixi/TokenControlsUI';
import { TurnMarker } from '../../src/app/pixi/token-renderer/turnMarker/TurnMarker';
import { FLASH } from '../../src/app/pixi/token-renderer/turnMarker/turnMarkerShape';
import { TurnTextures } from '../../src/app/pixi/token-renderer/turnMarker/turnTextures';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';

const token = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 100, y: 100, imagePath: '', ...changes } as TokenEntity);
const entry = (tokenId: string, order: number, changes: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 10, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...changes,
});

function sprite(x: number, y: number): TokenGroupContainer {
  const group = new Container() as TokenGroupContainer;
  group.tokenSize = 62;
  group.position.set(x, y);
  return group;
}

/** A store and the flashes over it; `sprites` are the tokens on the map (one beside the map has none). */
function setup(initiative: InitiativeState, tokens: Record<string, TokenEntity>, sprites: Record<string, TokenGroupContainer>, reduced = false, defeated: ReadonlySet<string> = new Set()) {
  let state: TurnMarkerState = { initiative, objects: { tokens }, grid: { size: 70 }, isMapLoading: false };
  const listeners = new Set<(next: TurnMarkerState) => void>();
  const world = new Container();
  const ticker = new Ticker();
  let time = 1000;
  const markers = new TurnMarkers({
    parent: world,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    spriteOf: (id) => sprites[id] ?? null,
    ticker: () => ticker,
    reducedMotion: () => reduced,
    defeated: () => defeated,
    now: () => time,
  });
  const set = (changes: Partial<TurnMarkerState>): void => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener(state);
  };
  /** Lets `ms` pass and runs one frame. */
  const pass = (ms: number): void => {
    time += ms;
    ticker.update(time);
  };
  return { markers, world, set, pass, ticker, get: () => state };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const order = (active: string): InitiativeState => ({
  ...createDefaultInitiativeState(), isActive: true, round: 1,
  entries: ['hero', 'ogre', 'ghost', 'away'].map((id, index) => entry(id, index, { isActive: id === active })),
});
const tokens = { hero: token('hero', { vision: { enabled: true } } as Partial<TokenEntity>), ogre: token('ogre'), ghost: token('ghost', { isHidden: true }), away: token('away', { offMap: true } as Partial<TokenEntity>) };
const sprites = { hero: sprite(100, 100), ogre: sprite(300, 100), ghost: sprite(500, 100) };

/** Long enough for any flash to have faded away. */
const FADED = 5000;

describe('the turn flash', () => {
  it('stands above the lighting and below the tokens\' bars', () => {
    expect(MAP_LAYER_Z.turn).toBeGreaterThan(90);
    expect(MAP_LAYER_Z.turn).toBeLessThan(TOKEN_UI_Z_INDEX);
    const { markers } = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => markers.destroy());
    expect(markers.layer.zIndex).toBe(MAP_LAYER_Z.turn);
  });

  it('flashes on the token whose turn begins, then is gone and leaves the ticker alone', () => {
    const { markers, set, pass, ticker } = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => markers.destroy());
    // A fight met running flashes nothing
    expect(markers.tokenIds).toEqual([]);
    expect(ticker.count).toBe(0);
    set({ initiative: order('hero') });
    expect(markers.tokenIds).toEqual(['hero']);
    pass(400);
    const view = markers.layer.children[0]!;
    expect(view.alpha).toBe(1);
    pass(FADED);
    expect(markers.tokenIds).toEqual([]);
    expect(markers.layer.children).toEqual([]);
    expect(ticker.count).toBe(0);
    // The fight ends: nothing flashes
    set({ initiative: { ...order('hero'), isActive: false } });
    expect(markers.tokenIds).toEqual([]);
  });

  it('flashes nothing during a load, or for a change that keeps the turn where it is', () => {
    const { markers, set } = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => markers.destroy());
    set({ isMapLoading: true, initiative: order('hero') });
    set({ isMapLoading: false });
    expect(markers.tokenIds).toEqual([]);
    // Re-sorted, the hero still holding the turn
    const resorted = order('hero');
    set({ initiative: { ...resorted, entries: [...resorted.entries].reverse() } });
    expect(markers.tokenIds).toEqual([]);
    // The collection's rules arrive: the turn is worked out again, and has not moved
    markers.refresh();
    expect(markers.tokenIds).toEqual([]);
  });

  it('takes the flash off a token that loses the turn at once, and flashes the next', () => {
    const { markers, set } = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => markers.destroy());
    set({ initiative: order('hero') });
    set({ initiative: order('ogre') });
    expect(markers.tokenIds).toEqual(['ogre']);
  });

  it('flashes every acting combatant on the map of the side whose turn begins, and of tied sides', () => {
    const sides = { ...order('none'), sides: { first: 'players' as const, active: 'players' as const } };
    const { markers, set } = setup(sides, tokens, sprites);
    cleanups.push(() => markers.destroy());
    const opponents = { ...sides, sides: { ...sides.sides, active: 'opponents' as const } };
    set({ initiative: opponents });
    // The combatant beside the map acts with its side but has no flash
    expect(markers.tokenIds).toEqual(['ogre', 'ghost']);
    set({ initiative: { ...opponents, round: 2, sides: { ...opponents.sides, roll: '1d6', rolls: { 2: { players: 2, opponents: 2 } } } } });
    expect(markers.tokenIds.sort()).toEqual(['ghost', 'hero', 'ogre']);
  });

  it('follows its token while it shows, and shows with it', () => {
    const { markers, set, pass } = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => markers.destroy());
    set({ initiative: order('ghost') });
    pass(400);
    const view = markers.layer.children[0]!;
    sprites.ghost.position.set(520, 140);
    pass(16);
    expect([view.x, view.y]).toEqual([520, 140]);
    // The canvas hides a token (session view, out of the players' sight): its flash goes with it
    sprites.ghost.visible = false;
    pass(16);
    expect(view.visible).toBe(false);
    sprites.ghost.visible = true;
    // A hidden token in the GM's view is translucent, and so is its flash
    sprites.ghost.alpha = 0.5;
    pass(16);
    expect(view.alpha).toBe(0.5);
    sprites.ghost.alpha = 1;
  });

  it('shows players only the flashes of tokens they see, while their list is shown', () => {
    const sides = { ...order('none'), sides: { first: 'players' as const, active: 'players' as const } };
    const { markers, set, pass } = setup(sides, tokens, sprites);
    cleanups.push(() => markers.destroy());
    set({ initiative: { ...sides, sides: { ...sides.sides, active: 'opponents' as const } } });
    pass(400);
    const seen = (id: string): boolean => id === 'ogre';
    // The layer, then the ogre's and the ghost's flashes, each as strong as on the canvas
    expect(markers.playerLayers(seen, true).map(({ visible }) => visible)).toEqual([true, true, false]);
    expect(markers.playerLayers(seen, true)[1]?.alpha).toBe(1);
    expect(markers.playerLayers(seen, false).every(({ visible }) => !visible)).toBe(true);
    // A picture of the scene shows none
    expect(markers.pictureLayers()).toEqual([{ layer: markers.layer, visible: false }]);
  });

  it('leaves the defeated of the side whose turn begins without a flash', () => {
    const sides = { ...order('none'), sides: { first: 'players' as const, active: 'players' as const } };
    const { markers, set } = setup(sides, tokens, sprites, false, new Set(['e-ogre']));
    cleanups.push(() => markers.destroy());
    set({ initiative: { ...sides, sides: { ...sides.sides, active: 'opponents' as const } } });
    expect(markers.tokenIds).toEqual(['ghost']);
  });

  it('hides from the canvas where the players are not shown their list', () => {
    const { markers } = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => markers.destroy());
    markers.showOnCanvas(false);
    expect(markers.layer.visible).toBe(false);
    markers.showOnCanvas(true);
    expect(markers.layer.visible).toBe(true);
  });

  it('swells in from smaller, or with reduced motion only fades, and is over sooner', () => {
    const full = setup(order('ogre'), tokens, sprites);
    cleanups.push(() => full.markers.destroy());
    full.set({ initiative: order('hero') });
    const spot = (markers: TurnMarkers): Container => markers.layer.children[0]!.getChildByLabel('turnSpot')!;
    expect(spot(full.markers).scale.x).toBeLessThan(1);
    expect(full.markers.playerLayers(() => true, true)[1]?.alpha).toBe(0);
    const reduced = setup(order('ogre'), tokens, sprites, true);
    cleanups.push(() => reduced.markers.destroy());
    reduced.set({ initiative: order('hero') });
    expect(spot(reduced.markers).scale.x).toBe(1);
    reduced.pass(1100);
    full.pass(1100);
    expect(reduced.markers.tokenIds).toEqual([]);
    expect(full.markers.tokenIds).toEqual(['hero']);
  });

  it('keeps the spotlight off the art with an inverse alpha mask, and leaves only the rim where the renderer has no masks', () => {
    const textures = new TurnTextures();
    const marker = new TurnMarker(textures, FLASH.full, 0);
    cleanups.push(() => { marker.destroy(); textures.destroy(); });
    const spot = marker.view.getChildByLabel('turnSpot')!;
    const pool = spot.children[0]!;
    expect(spot.mask).toBe(marker.view.getChildByLabel('turnFigure'));
    expect(spot).toMatchObject({ _maskOptions: { inverse: true, channel: 'alpha' } });
    expect(pool.visible).toBe(true);
    marker.keepOffArt(false);
    expect(spot.mask).toBeFalsy();
    expect(pool.visible).toBe(false);
  });

  it('keeps a framed token\'s spotlight off the disc its ring encloses, and unframed art off its own shape', () => {
    const textures = new TurnTextures();
    const marker = new TurnMarker(textures, FLASH.full, 0);
    cleanups.push(() => { marker.destroy(); textures.destroy(); });
    const figure = marker.view.getChildByLabel('turnFigure') as Sprite;
    const framed = Object.assign(sprite(0, 0), { tokenData: token('a') });
    marker.draw(35, 1, 2);
    marker.follow(framed);
    expect(figure.texture).toBe(textures.disc);
    expect(figure.width).toBeCloseTo(70);
    const art = new Sprite({ texture: textures.pool, anchor: 0.5, label: 'tokenSprite', rotation: 1 });
    art.width = 50;
    art.height = 40;
    const unframed = Object.assign(sprite(0, 0), { tokenData: token('b', { showRing: false }) });
    unframed.addChild(art);
    marker.follow(unframed);
    expect(figure.texture).toBe(art.texture);
    expect([figure.width, figure.height, figure.rotation]).toEqual([50, 40, 1]);
  });
});
