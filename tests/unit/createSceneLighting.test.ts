import { describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { App } from 'obsidian';
import { createSceneLighting, type SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';

const built = vi.hoisted(() => ({ engine: [] as unknown[], fallback: [] as unknown[] }));

vi.mock('../../src/app/pixi/lighting/LightingRenderer', () => ({
  LightingRenderer: class {
    modeLayer = { visible: false };
    constructor(deps: unknown) { built.engine.push(deps); }
    destroy(): void {}
  },
}));
vi.mock('../../src/app/pixi/lighting/CanvasLightingFallback', () => ({
  CanvasLightingFallback: class {
    modeLayer = { visible: false };
    constructor(deps: unknown) { built.fallback.push(deps); }
    destroy(): void {}
  },
}));

describe('createSceneLighting', () => {
  const rules = (): typeof GENERIC_SIGHT_RULES => GENERIC_SIGHT_RULES;
  const onSightChange = vi.fn();
  const deps = (): SceneLightingDeps => ({
    viewport: {} as Viewport,
    app: { renderer: {} } as Application,
    store: { getState: () => ({ mapPath: 'a.atlasmap', lighting: { enabled: false } }), subscribe: () => () => undefined } as unknown as ViewAtlasStore,
    obsApp: { loadLocalStorage: () => null, saveLocalStorage: () => undefined } as unknown as App,
    measurement: () => ({ unitDistance: 5 }) as never,
    bounds: () => null,
    albedo: () => null,
    rules,
    onSightChange,
  });

  it('gives the engine view the map\'s sight rules and its report of new sight', () => {
    createSceneLighting(deps()).destroy();
    expect(built.engine).toHaveLength(1);
    expect(built.engine[0]).toMatchObject({ rules, onSightChange });
  });
});
