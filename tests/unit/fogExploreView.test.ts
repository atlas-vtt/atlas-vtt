// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenInput } from '../../src/app/types/viewState';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The mesh that mixes two pictures needs WebGL; what it draws is measured in tests/gpu/fogFade.gpu.test.ts.
vi.mock('../../src/app/pixi/fog/fogEdgeMesh', () => ({
  FogEdgeMesh: class {
    setEdge(): void {}
    fadeFrom(): void {}
    setMix(): void {}
    destroy(): void {}
  },
}));

const MAP = { x: 0, y: 0, width: 2100, height: 1400 };
const hero = { x: 350, y: 350, imagePath: 'hero.png', vision: { enabled: true } } as TokenInput;

describe('a map view whose party tokens clear fog', () => {
  const views: FogOfWarRenderer[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    // jsdom has no Canvas 2D implementation.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => (): void => undefined }) as never);
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList);
  });

  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A loaded scene under fog in the GM's view, with the option on. */
  function fogView(): { store: ViewAtlasStore; fog: FogOfWarRenderer } {
    const store = createViewAtlasStore(createInMemoryApp().app, `fog-explore-view-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ mapPath: 'maps/a.atlasmap', isMapLoading: false, isGMView: true });
    store.getState().coverAllFog(MAP);
    store.getState().setFogExplore({ distance: 2 });
    const viewport = Object.assign(new Container(), { options: {}, scale: { x: 1, y: 1 }, toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }) });
    const app = { canvas: createEl('canvas'), renderer: { name: 'webgl' } };
    const fog = new FogOfWarRenderer(viewport as never, app as never, new EventEmitter() as never, store, () => MAP);
    views.push(fog);
    return { store, fog };
  }

  it('reveals around a party token that is put down, from the fog the view draws, and the reveal fades', () => {
    const { store, fog } = fogView();
    expect(fog.getCommittedCoverage()!.covers({ x: 700, y: 700 })).toBe(true);
    store.getState().addTokens([{ ...hero, x: 700, y: 700 }]);
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(2);
    expect(fog.getCommittedCoverage()!.covers({ x: 700, y: 700 })).toBe(false);
    expect(fog.getCommittedCoverage()!.covers({ x: 700, y: 900 })).toBe(true);
    expect(fog.fading).toBe(true);
  });

  it('reveals nothing once the view is gone', () => {
    const { store, fog } = fogView();
    fog.destroy();
    store.getState().addTokens([{ ...hero, x: 700, y: 700 }]);
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(1);
  });
});
