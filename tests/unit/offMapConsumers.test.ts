import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHT_PRESETS } from '../../src/app/lighting/lightPresets';
import { SightTokens } from '../../src/app/lighting/sightOnDrop';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import { tokenSyncState } from '../../src/app/pixi/token-renderer/tokenSyncState';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { SpatialAudioEngine } from '../../src/app/audio/SpatialAudioEngine';
import { objectsMovedWithMap } from '../../src/app/grid/mapStretchObjects';
import { collectMapObjects, objectAnchors } from '../../src/app/clipboard/mapObjectContent';
import { shownRollTokens } from '../../src/app/pixi/playerRollTokens';
import { PlayerInstanceBadges } from '../../src/app/pixi/token-renderer/PlayerInstanceBadges';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';

const BOUNDS = { width: 1000, height: 600 };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];

/** A creature that sees and carries a torch, on the map or beside it. */
const torchBearer = (id: string, offMap: boolean): TokenEntity => ({
  id, kind: 'token', x: offMap ? -105 : 300, y: 300, imagePath: 'art/goblin.png',
  vision: { enabled: true }, light: LIGHT_PRESETS.torch.emission, ...(offMap && { offMap: true as const }),
});

const tokensOf = (...tokens: TokenEntity[]): Record<string, TokenEntity> => Object.fromEntries(tokens.map((token) => [token.id, token]));

function scene(tokens: Record<string, TokenEntity>): SceneState {
  return { objects: { walls: {}, lights: {}, tokens } as ViewAtlasState['objects'], lighting: { enabled: true, ambient: 0 }, grid: null, heldTokens: {} };
}

describe('a combatant kept beside the map is no part of it', () => {
  it('gets no sprite: the token sprites, and so hit tests, controls and pictures of the scene, follow the map\'s tokens', () => {
    const tokens = tokensOf(torchBearer('on', false), torchBearer('beside', true));
    const synced = tokenSyncState({ objects: { tokens } as ViewAtlasState['objects'], isMapLoading: false, selectedIds: [] });
    expect(Object.keys(synced.tokens)).toEqual(['on']);
  });

  it('is never shown, so never selected from its card or by Select All', () => {
    const tokens = tokensOf(torchBearer('beside', true));
    const harness = {
      store: { getState: () => ({ objects: { tokens }, isPlayerView: false, isGMView: true }) },
      playerSight: { perception: () => undefined, hides: () => false },
      isInPlayerMode: () => false,
      hidesToken: Reflect.get(TokenRenderer.prototype, 'hidesToken') as unknown,
    };
    expect(TokenRenderer.prototype.showsToken.call(harness, 'beside')).toBe(false);
  });

  it('gives no sight and carries no light', () => {
    const builder = new SceneModelBuilder();
    const beside = builder.update(scene(tokensOf(torchBearer('beside', true))), BOUNDS, measurement).model;
    expect(beside.lights).toEqual([]);
    expect(beside.reaches).toEqual([]);
    expect(beside.gmSight.regions).toEqual([]);
    const on = new SceneModelBuilder().update(scene(tokensOf(torchBearer('on', false))), BOUNDS, measurement).model;
    expect(on.lights).toHaveLength(1);
    expect(on.gmSight.regions.length).toBeGreaterThan(0);
  });

  it('is never shown within its footprint nor read by sight on drop', () => {
    const state = scene(tokensOf(torchBearer('beside', true)));
    const model = new SceneModelBuilder().update(state, BOUNDS, measurement).model;
    expect(new SceneSpots().update(model, state, measurement)).toEqual([]);
    expect(new SightTokens().read(state)).toEqual({});
  });

  it('is never where spatial audio listens', () => {
    const tokens = tokensOf(torchBearer('beside', true), torchBearer('on', false));
    const listener = (selectedIds: string[]): unknown => Reflect.apply(Reflect.get(SpatialAudioEngine.prototype, 'getSelectedToken') as (state: unknown) => unknown, {}, [{ selectedIds, objects: { tokens } }]);
    expect(listener(['beside'])).toBeNull();
    expect(listener(['beside', 'on'])).toEqual({ x: 300, y: 300 });
  });

  it('stays where it waits when the map is stretched or turned under the scene', () => {
    const beside = torchBearer('beside', true);
    const on = torchBearer('on', false);
    const moved = objectsMovedWithMap({ tokens: tokensOf(beside, on), pins: {}, texts: {}, lights: {}, audios: {}, drawings: {}, walls: {}, fog: {} } as unknown as ViewAtlasState['objects'], (p) => ({ x: p.x * 2, y: p.y * 2 }));
    expect(moved.tokens.beside).toBe(beside);
    expect(moved.tokens.on).toMatchObject({ x: 600, y: 600 });
  });

  it('is never copied, and never stands where a copy is put down', () => {
    const objects = { tokens: tokensOf(torchBearer('beside', true)), drawings: {}, texts: {}, pins: {} };
    expect(collectMapObjects(objects, ['beside']).tokens).toEqual([]);
    expect(objectAnchors(objects)).toEqual([]);
  });

  it('is never among the tokens a players\' frame shows, which online play shares', () => {
    const tokens = tokensOf(torchBearer('beside', true), torchBearer('on', false));
    const state = { mapPath: 'maps/cave.atlasmap', mapLoaded: true, isMapLoading: false, objects: { tokens } };
    const shown = shownRollTokens(state, 'maps/cave.atlasmap', { beside: {}, on: {} }, () => undefined);
    expect([...shown.keys()]).toEqual(['on']);
  });

  it('takes a players\' number among look-alikes where their initiative list shows it, never where it is hidden', () => {
    const goblin = (id: string, extra: Partial<TokenEntity>): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: 'art/goblin.png', ...extra } as TokenEntity);
    const tokens = tokensOf(goblin('on', { instanceNumber: 1 }), goblin('beside', { instanceNumber: 2, offMap: true }), goblin('secret', { instanceNumber: 3, offMap: true, isHidden: true }));
    const badges = new PlayerInstanceBadges({ state: () => ({ mapPath: 'maps/cave.atlasmap', objects: { tokens } }), sprites: () => ({}) });
    badges.pass(() => true);
    expect([badges.numberOf('on'), badges.numberOf('beside'), badges.numberOf('secret')]).toEqual([1, 2, null]);
  });
});
