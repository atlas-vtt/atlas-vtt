import { afterEach, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import * as coverage from '../../src/app/fog/fogCoverage';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { shownRollTokens, type RollSceneState } from '../../src/app/pixi/playerRollTokens';
import { PlayerSightTokens } from '../../src/app/pixi/token-renderer/PlayerSightTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogRectangle } from '../helpers/fogOperations';

afterEach(() => vi.restoreAllMocks());

const MAP = 'maps/cave.atlasmap';

it('names rolls from the fog the renderer already holds, working out nothing again for unchanged fog', () => {
  // jsdom has no Canvas 2D implementation; the real fog renderer draws into a stub.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect() {}, save() {}, restore() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    setTransform() {}, drawImage() {}, putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  } as never);
  const tokens = {
    wolf: { id: 'wolf', kind: 'character', name: 'Wolf', x: 100, y: 100, imagePath: '' },
    bear: { id: 'bear', kind: 'character', name: 'Bear', x: 10, y: 10, imagePath: '' },
  };
  const fog: Record<string, FogRectangleFill> = { paint: fogRectangle() };
  const store = createStore(() => ({
    isPlayerView: false, isGMView: true, isMapLoading: false, mapLoaded: true, mapPath: MAP, activeTool: 'select',
    objects: { fog, tokens },
  }));
  const builds = vi.spyOn(coverage, 'fogCoverage');
  const renderer = new FogOfWarRenderer(new Container() as never, { canvas: createEl('canvas') } as never, new EventEmitter() as never, store as never);
  try {
    const sprites = Object.fromEntries(Object.values(tokens).map((t) => [t.id, { x: t.x, y: t.y } as TokenGroupContainer]));
    const sight = new PlayerSightTokens({ tokens: () => tokens as never, sprites: () => sprites, held: () => new Set() });
    sight.setFogProvider(() => renderer.getCommittedCoverage(), () => false);
    const roll = (): string[] => [...shownRollTokens(store.getState() as unknown as RollSceneState, MAP, sprites, () => sight.framePerception()).keys()];

    expect(roll()).toEqual(['wolf']);
    const covers = vi.spyOn(Object.getPrototypeOf(renderer.getCommittedCoverage()), 'covers');
    const built = builds.mock.calls.length;

    // A players' frame, a fog redraw and more rolls of the same scene
    sight.frameLayers(sight.framePerception());
    store.setState({ isMapLoading: true });
    store.setState({ isMapLoading: false });
    expect(roll()).toEqual(['wolf']);
    expect(roll()).toEqual(['wolf']);
    expect(builds).toHaveBeenCalledTimes(built);
    expect(covers).not.toHaveBeenCalled();

    // Fog painted over the wolf: worked out once, and the next roll names nobody
    store.setState({ objects: { fog: { paint: fogRectangle(), more: fogRectangle({ id: 'more', timestamp: 2, x: 90, y: 90 }) }, tokens } });
    expect(roll()).toEqual([]);
    expect(builds).toHaveBeenCalledTimes(built + 1);
  } finally {
    renderer.destroy();
  }
});
