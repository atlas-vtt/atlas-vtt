// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { sharedSight } from '../../../src/app/online/gm/sceneInputs';
import type { SceneState as OnlineSceneState } from '../../../src/app/online/gm/atlasView';
import { CanvasLightingFallback } from '../../../src/app/pixi/lighting/CanvasLightingFallback';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { TokenEntity } from '../../../src/app/types';
import type { SceneLighting } from '../../../src/app/types/lightingTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import { SceneModelBuilder } from '../../../src/app/vision/sceneModel';
import { NO_SIGHT, SEES_ALL, type Sight } from '../../../src/app/vision/sight';
import { GENERIC_SIGHT_RULES } from '../../../src/app/vision/sightRules';
import { sceneHasVision } from '../../../src/app/vision/tokenSightPolicy';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { watchSightMasks } from '../../helpers/sightMaskWatch';

const BOUNDS = { width: 1000, height: 1000 };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];

const level = (id: string, bottom: number): SceneLevel => ({ id, name: id, elevation: { bottom, top: bottom + 10 }, background: null });
const LEVELS: SceneLevel[] = [level('ground', 0), level('upper', 10)];

const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 30 } };
const goblin: TokenEntity = { id: 'goblin', kind: 'token', imagePath: 'g.png', x: 500, y: 500 };
const upstairs = (token: TokenEntity): TokenEntity => ({ ...token, level: 'upper' });

interface Scene {
  tokens: Record<string, TokenEntity>;
  levels?: SceneLevel[];
  viewedLevel?: string;
  lighting?: Partial<SceneLighting>;
}

function state({ tokens, levels, viewedLevel, lighting }: Scene): SceneState {
  const objects = { walls: {}, lights: {}, tokens } as unknown as ViewAtlasState['objects'];
  return { objects, lighting: { enabled: true, ambient: 0, ...lighting }, grid: null, heldTokens: {}, ...(levels && { levels }), ...(viewedLevel && { viewedLevel }) };
}

/** The players' and the GM's sight of a scene, as the lighting engine's model works them out. */
function modelSight(scene: Scene): { players: Sight; gm: Sight } {
  const { model } = new SceneModelBuilder().update(state(scene), BOUNDS, measurement);
  return { players: model.sight, gm: model.gmSight ?? model.sight };
}

const seers = (sight: Sight): string[] => [...new Set(sight.regions.map((region) => region.tokenId))];

describe('sight on a scene with levels', () => {
  it('is unchanged without levels: the vision tokens\' sight, or everything when no token has vision', () => {
    expect(seers(modelSight({ tokens: { hero, goblin } }).players)).toEqual(['hero']);
    expect(modelSight({ tokens: { goblin } }).players).toBe(SEES_ALL);
    expect(modelSight({ tokens: { goblin, hidden: { ...hero, id: 'hidden', isHidden: true } } }).players).toEqual(NO_SIGHT);
    // A scene of one level is a scene without levels.
    expect(modelSight({ tokens: { goblin }, levels: [LEVELS[0]!] }).players).toBe(SEES_ALL);
  });

  it('shows nothing of a floor the party is not on, and the party\'s sight on its own floor', () => {
    const tokens = { hero, goblin: upstairs(goblin) };
    const upper = modelSight({ tokens, levels: LEVELS, viewedLevel: 'upper' });
    expect(upper.players).toBe(NO_SIGHT);
    expect(upper.gm).toBe(NO_SIGHT);
    expect(seers(modelSight({ tokens, levels: LEVELS, viewedLevel: 'ground' }).players)).toEqual(['hero']);
  });

  it('shows every floor whole while no token on any floor has vision', () => {
    const tokens = { goblin, imp: upstairs({ ...goblin, id: 'imp' }) };
    expect(modelSight({ tokens, levels: LEVELS, viewedLevel: 'upper' }).players).toBe(SEES_ALL);
    expect(modelSight({ tokens, levels: LEVELS, viewedLevel: 'ground' }).players).toBe(SEES_ALL);
  });

  it('shows every floor whole while the scene has token vision off', () => {
    const tokens = { hero, goblin: upstairs(goblin) };
    expect(modelSight({ tokens, levels: LEVELS, viewedLevel: 'upper', lighting: { tokenVision: false } }).players).toBe(SEES_ALL);
  });

  it('counts a hidden vision token on another floor as vision: that floor shows the players nothing, and the GM nothing either', () => {
    const tokens = { hidden: { ...hero, id: 'hidden', isHidden: true }, goblin: upstairs(goblin) };
    const upper = modelSight({ tokens, levels: LEVELS, viewedLevel: 'upper' });
    expect(upper.players).toBe(NO_SIGHT);
    expect(upper.gm).toBe(NO_SIGHT);
    // On its own floor the hidden token sees for the GM's shading only, as on a scene of one level.
    const ground = modelSight({ tokens, levels: LEVELS, viewedLevel: 'ground' });
    expect(ground.players).toEqual(NO_SIGHT);
    expect(seers(ground.gm)).toEqual(['hidden']);
  });

  it('builds a floor anew when a token on another floor switches its vision', () => {
    const builder = new SceneModelBuilder();
    const blind = { tokens: { hero: { ...hero, vision: { enabled: false } }, goblin: upstairs(goblin) }, levels: LEVELS, viewedLevel: 'upper' };
    expect(builder.update(state(blind), BOUNDS, measurement).model.sight).toBe(SEES_ALL);
    const seeing = state({ ...blind, tokens: { ...blind.tokens, hero } });
    // The upper floor's own tokens are the same record: only the scene's vision changed.
    const { model, rebuilt } = builder.update({ ...seeing, objects: { ...seeing.objects, tokens: { ...seeing.objects.tokens, goblin: blind.tokens.goblin } } }, BOUNDS, measurement);
    expect(rebuilt).toBe(true);
    expect(model.sight).toBe(NO_SIGHT);
  });

  it('counts a token with vision on on any floor, hidden or not', () => {
    const tokens = { goblin, hero: upstairs(hero) };
    expect(sceneHasVision(tokens)).toBe(true);
    expect(sceneHasVision({ goblin })).toBe(false);
    expect(sceneHasVision({ hidden: { ...hero, isHidden: true } })).toBe(true);
    expect(sceneHasVision({})).toBe(false);
  });
});

describe('the canvas fallback on a scene with levels', () => {
  let restore: (() => void) | undefined;
  afterEach(() => { restore?.(); restore = undefined; });

  it('keeps a floor the party is not on black, and opens it when no token on any floor has vision', () => {
    restore = stubJsdomGraphics();
    const masks = watchSightMasks();
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `level-sight-${Math.random()}`);
    store.setState({ persistenceEnabled: false, levels: LEVELS, viewedLevel: 'upper', objects: { ...store.getState().objects, tokens: { hero, goblin: upstairs(goblin) } } });
    store.getState().setSceneLighting({ enabled: true });
    const viewport = new Container();
    const fallback = new CanvasLightingFallback({ viewport: viewport as unknown as Viewport, store, measurement, bounds: () => BOUNDS });
    try {
      expect(fallback.currentSight()).toEqual(NO_SIGHT);
      store.getState().updateToken('hero', { vision: { enabled: false } });
      expect(fallback.currentSight()).toBe(SEES_ALL);
      store.getState().updateToken('hero', { vision: { enabled: true } });
      expect(fallback.currentSight()).toEqual(NO_SIGHT);
      store.getState().setSceneLighting({ tokenVision: false });
      expect(fallback.currentSight()).toBe(SEES_ALL);
    } finally {
      fallback.destroy();
      viewport.destroy();
      masks.restore();
    }
  });
});

describe('the online share of a floor', () => {
  const shared = (tokens: Record<string, TokenEntity>, viewedLevel: string): boolean => {
    const scene = { ...state({ tokens, levels: LEVELS, viewedLevel }), mapPath: 'm.atlasmap', mapLoaded: true, isMapLoading: false } as unknown as OnlineSceneState;
    const sight = sharedSight({ state: scene, rules: GENERIC_SIGHT_RULES, shown: new Set(), tokenAlias: (id) => id, lightAlias: (id) => id });
    return sight.blind === true;
  };

  it('tells players they are blind on a floor the party is not on, and not while no floor has a vision token', () => {
    expect(shared({ hero, goblin: upstairs(goblin) }, 'upper')).toBe(true);
    expect(shared({ hero, goblin: upstairs(goblin) }, 'ground')).toBe(false);
    expect(shared({ goblin, imp: upstairs({ ...goblin, id: 'imp' }) }, 'upper')).toBe(false);
  });
});
