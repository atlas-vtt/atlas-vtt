import { isDeepStrictEqual } from 'node:util';
import { Container, Graphics, type GraphicsPath } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { describe, expect, it } from 'vitest';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { NO_SIGHT, SEES_ALL, type Sight } from '../../src/app/vision/sight';
import { CanvasLightingFallback as FrozenFallback } from '../oracles/sightPolicyBaseline/CanvasLightingFallback';
import { NO_SIGHT as FROZEN_NO_SIGHT, SEES_ALL as FROZEN_SEES_ALL } from '../oracles/sightPolicyBaseline/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { seedBlocks, sightScene, type SightScene } from '../helpers/sightScenes';

interface Fallback {
  currentSight(): Sight;
  destroy(): void;
}

/** What the fallback drew: each fill or cut with its colour and the paths it was made of, without the ids PIXI numbers its objects by. */
function drawn(viewport: Container): string {
  const darkness = viewport.children[0];
  if (!(darkness instanceof Graphics)) throw new Error('The fallback drew no darkness');
  const instructions = darkness.context.instructions.map((instruction) => {
    if (instruction.action !== 'fill' && instruction.action !== 'cut' && instruction.action !== 'stroke') return { action: instruction.action };
    const { style, path, hole } = instruction.data as { style: { color: number; alpha: number }; path: GraphicsPath; hole?: GraphicsPath };
    return { action: instruction.action, color: style.color, alpha: style.alpha, path: path.instructions, hole: hole?.instructions ?? null };
  });
  return JSON.stringify(instructions, (key, value: unknown) => (key === 'uid' ? undefined : value));
}

function open(scene: SightScene, store: ViewAtlasStore, Kind: new (deps: ConstructorParameters<typeof CanvasLightingFallback>[0]) => Fallback): { fallback: Fallback; viewport: Container } {
  const viewport = new Container();
  const fallback = new Kind({ viewport: viewport as unknown as Viewport, store, measurement: scene.measurement, bounds: () => scene.bounds, rules: () => scene.rules });
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
    const problems: string[] = [];
    const seen = { darkness: 0, regions: 0 };
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
            const darkness = drawn(now.viewport);
            if (darkness !== drawn(before.viewport)) problems.push(`seed ${seed}, ${step}: darkness differs`);
            if (darkness !== '[]') seen.darkness++;
            if (ours.regions.length > 0) seen.regions++;
            previous = [ours, theirs];
          }
        } finally {
          now.fallback.destroy();
          before.fallback.destroy();
        }
      }
    } finally {
      restore();
    }
    expect(problems).toEqual([]);
    // The block compared something: darkness was drawn and tokens saw.
    expect(seen.darkness).toBeGreaterThan(0);
    expect(seen.regions).toBeGreaterThan(0);
  });
});
