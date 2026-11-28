// @vitest-environment jsdom
import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import { pictureBasisOf } from '../../src/app/online/gm/atlasMapLayers';
import { EyesSight } from '../../src/app/online/gm/eyesSight';
import type { TokenEntity } from '../../src/app/types';
import { NO_SIGHT, SEES_ALL } from '../../src/app/vision/sight';
import { PLAYER_SIGHT_POLICY } from '../../src/app/vision/tokenSightPolicy';
import { bareMapView, type BareMapView } from '../helpers/bareMapView';

/**
 * The scene lighting as the view holds it: the sight it worked out last, and whether that is the sight
 * of the scene the store holds (`sightIsCurrent`). After a lost graphics context, a scene switch or the
 * lighting switched on, the view keeps the sight from before until it has built the scene again.
 */
const lighting = vi.hoisted(() => ({ sees: true, current: true }));
vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => ({
    modeLayer: { visible: false },
    isEnabled: () => deps.store.getState().lighting.enabled,
    currentSight: () => (lighting.sees ? SEES_ALL : NO_SIGHT),
    sightIsCurrent: () => !deps.store.getState().lighting.enabled || lighting.current,
    lightReaches: () => [],
    ambientLight: () => ({ ambient: 1 }),
    refreshBounds: () => undefined,
    resetExplored: () => undefined,
    editExplored: () => false,
    beforeMapUnload: () => undefined,
    renderForFrame: <T,>(_frame: unknown, render: () => T): T => render(),
    destroy: () => undefined,
  }),
}));

const token = (id: string, more: Partial<TokenEntity>): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, name: id, size: 1, x: 0, y: 0, ...more } as TokenEntity);

const views: BareMapView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.restoreAllMocks();
  lighting.sees = true;
  lighting.current = true;
});

/** A lit scene of one floor as Atlas builds it: the hero, whose eyes the players see through, and a goblin. */
async function litScene(): Promise<BareMapView> {
  const view = await bareMapView({ whole: {} });
  views.push(view);
  const { renderer, store } = view;
  store.setState((state) => ({ lighting: { ...state.lighting, enabled: true, ambient: 1 } }));
  store.getState().addTokens([
    token('hero', { x: 100, y: 100, vision: { enabled: true } }),
    token('goblin', { x: 300, y: 200 }),
  ]);
  await expect.poll(() => ['hero', 'goblin'].every((id) => renderer.getTokenRenderer()?.getTokenSprites()[id] instanceof Container)).toBe(true);
  return view;
}

describe('the tokens players are named and sent while the lighting\'s sight is not the scene\'s', () => {
  it('are none, as the doors, places and badges show nothing, until the scene is built again', async () => {
    const { renderer, store } = await litScene();
    const mapPath = store.getState().mapPath!;
    // What rolls name, the token list a table sends and the badges its initiative list shows read this.
    const named = (): string[] => [...renderer.playerRollTokens(mapPath).keys()].sort();
    // A player's own eyes (shared vision) are cut from the same canvas.
    const eyes = new EyesSight(PLAYER_SIGHT_POLICY, { state: () => store.getState(), rules: () => undefined });
    const ownNamed = (): string[] => [...eyes.tokens(pictureBasisOf(renderer)!, renderer).playerRollTokens(mapPath).keys()].sort();

    expect({ named: named(), own: ownNamed() }).toEqual({ named: ['goblin', 'hero'], own: ['goblin', 'hero'] });

    // A door closes between the hero and the goblin while the graphics context is lost: the view still
    // holds the sight from before, which saw the goblin.
    lighting.current = false;
    expect({ named: named(), own: ownNamed() }).toEqual({ named: [], own: [] });

    // The restored context builds the scene: the goblin is out of the hero's sight.
    lighting.sees = false;
    lighting.current = true;
    expect({ named: named(), own: ownNamed() }).toEqual({ named: ['hero'], own: ['hero'] });
  });

  it('are none for a lit scene whose sight was never built, as when the lighting was just switched on', async () => {
    const { renderer, store } = await litScene();
    const mapPath = store.getState().mapPath!;
    lighting.current = false;
    expect([...renderer.playerRollTokens(mapPath).keys()]).toEqual([]);
    // An unlit scene's sight hides nothing and is always the scene's.
    store.setState((state) => ({ lighting: { ...state.lighting, enabled: false } }));
    expect([...renderer.playerRollTokens(mapPath).keys()].sort()).toEqual(['goblin', 'hero']);
  });
});
