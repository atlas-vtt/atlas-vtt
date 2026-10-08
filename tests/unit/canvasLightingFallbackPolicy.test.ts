import { isDeepStrictEqual } from 'node:util';
import { Container, type Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { describe, expect, it } from 'vitest';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import type { SightMaskShapes } from '../../src/app/pixi/lighting/SightMask';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { NO_SIGHT, SEES_ALL, type Sight } from '../../src/app/vision/sight';
import { CanvasLightingFallback as FrozenFallback } from '../oracles/sightPolicyBaseline/CanvasLightingFallback';
import { NO_SIGHT as FROZEN_NO_SIGHT, SEES_ALL as FROZEN_SEES_ALL } from '../oracles/sightPolicyBaseline/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { darknessCovers, darknessOf, darknessPaint } from '../helpers/darknessCover';
import { maskCovers, maskViewOf, watchSightMasks } from '../helpers/sightMaskWatch';
import { seedBlocks, sightScene, type SightScene } from '../helpers/sightScenes';

interface Fallback {
  modeLayer: { visible: boolean };
  currentSight(): Sight;
  destroy(): void;
}

const PROBES = 20;

/**
 * Where the darkness the previous version meant to draw and the black the current one composes
 * differ, at points spread over the map. Both are read as what they mean, by the polygons
 * themselves: the previous version's holes overlapped, which no renderer drew as meant, and the
 * current version composes on a canvas, which the browser tests hold to these polygons.
 */
function comparePoints(now: SightMaskShapes | null, before: Graphics, { width, height }: SightScene['bounds']): { compared: number; differ: number } {
  let compared = 0, differ = 0;
  for (let row = 0; row < PROBES; row++) {
    for (let column = 0; column < PROBES; column++) {
      const x = ((column + 0.37) * width) / PROBES, y = ((row + 0.61) * height) / PROBES;
      compared++;
      if (maskCovers(now, x, y) !== darknessCovers(before, x, y)) differ++;
    }
  }
  return { compared, differ };
}

/** The players see through the black unless its layer is shown at full alpha; that its texels are opaque black is the browser tests' to hold. */
function seeThrough(layer: Container): boolean {
  return !layer.visible || layer.alpha !== 1;
}

/** The previous version drew every fill in black at alpha 1. */
function paintedBlack(darkness: Graphics): boolean {
  return darknessPaint(darkness).every((fill) => fill.color === 0x000000 && fill.alpha === 1);
}

function open(scene: SightScene, store: ViewAtlasStore, Kind: new (deps: ConstructorParameters<typeof CanvasLightingFallback>[0]) => Fallback): { fallback: Fallback; viewport: Container } {
  const viewport = new Container();
  const fallback = new Kind({ viewport: viewport as unknown as Viewport, store, measurement: scene.measurement, bounds: () => scene.bounds, rules: () => scene.rules });
  // The players' view: the current version composes its black only while that shows it.
  fallback.modeLayer.visible = true;
  return { fallback, viewport };
}

/** The scene's store, then a few changes a map sees: the same lighting again, a vision token hidden, a token moved, token vision switched. */
function* steps(scene: SightScene, store: ViewAtlasStore): Generator<string> {
  const { state } = scene;
  store.setState({ persistenceEnabled: false, grid: state.grid, lighting: state.lighting, heldTokens: state.heldTokens, objects: { ...store.getState().objects, ...state.objects } });
  yield 'the scene';
  store.setState({ lighting: { ...store.getState().lighting } });
  yield 'the same lighting again';
  const keys = Object.keys(store.getState().objects.tokens);
  const seeing = keys.find((key) => store.getState().objects.tokens[key]!.vision?.enabled);
  if (seeing) {
    const token = store.getState().objects.tokens[seeing]!;
    store.setState((now) => ({ objects: { ...now.objects, tokens: { ...now.objects.tokens, [seeing]: { ...token, isHidden: !token.isHidden } } } }));
    yield 'a vision token hidden or shown';
  }
  const moved = keys[keys.length - 1];
  if (moved) {
    const token = store.getState().objects.tokens[moved]!;
    store.setState((now) => ({ objects: { ...now.objects, tokens: { ...now.objects.tokens, [moved]: { ...token, x: token.x + 60 } } } }));
    yield 'a token moved';
  }
  store.setState((now) => ({ lighting: { ...now.lighting, tokenVision: now.lighting.tokenVision === false } }));
  yield 'token vision switched';
}

const relations = (sight: Sight, before: Sight | null, none: Sight, all: Sight): Record<string, boolean> =>
  ({ kept: sight === before, none: sight === none, all: sight === all });

describe('the canvas fallback compared with its previous version', () => {
  it.each(seedBlocks(60, 10).map((seeds) => ({ first: seeds[0]!, last: seeds[seeds.length - 1]!, seeds })))('scenes $first to $last give the same sight and darkness', ({ seeds }) => {
    const restore = stubJsdomGraphics();
    const masks = watchSightMasks();
    const problems: string[] = [];
    const seen = { darkness: 0, regions: 0, points: 0 };
    try {
      for (const seed of seeds) {
        const scene = sightScene(seed);
        const store = createViewAtlasStore(createInMemoryApp().app, `fallback-${seed}`);
        const now = open(scene, store, CanvasLightingFallback);
        const before = open(scene, store, FrozenFallback);
        let previous: [Sight | null, Sight | null] = [null, null];
        try {
          for (const step of steps(scene, store)) {
            const ours = now.fallback.currentSight();
            const theirs = before.fallback.currentSight();
            if (!isDeepStrictEqual(ours, theirs)) problems.push(`seed ${seed}, ${step}: sight differs`);
            if (!isDeepStrictEqual(relations(ours, previous[0], NO_SIGHT, SEES_ALL), relations(theirs, previous[1], FROZEN_NO_SIGHT, FROZEN_SEES_ALL))) problems.push(`seed ${seed}, ${step}: sight identity differs`);
            const shapes = masks.shapesIn(now.viewport);
            const drawing = darknessOf(before.viewport);
            const { compared, differ } = comparePoints(shapes, drawing, scene.bounds);
            if (differ > 0) problems.push(`seed ${seed}, ${step}: darkness differs at ${differ} points`);
            if (seeThrough(maskViewOf(now.viewport)) || seeThrough(drawing) || !paintedBlack(drawing)) problems.push(`seed ${seed}, ${step}: the darkness is not shown as opaque black`);
            if (shapes && (shapes.shown !== null || shapes.darkness.length > 0)) seen.darkness++;
            seen.points += compared;
            if (ours.regions.length > 0) seen.regions++;
            previous = [ours, theirs];
          }
        } finally {
          now.fallback.destroy();
          before.fallback.destroy();
        }
      }
    } finally {
      masks.restore();
      restore();
    }
    expect(problems).toEqual([]);
    // The block compared something: darkness was drawn and tokens saw.
    expect(seen.darkness).toBeGreaterThan(0);
    expect(seen.regions).toBeGreaterThan(0);
    expect(seen.points).toBeGreaterThan(PROBES * PROBES * seeds.length * 3);
  });
});
