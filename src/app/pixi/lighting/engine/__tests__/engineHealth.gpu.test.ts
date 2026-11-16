import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import { resetContext } from '../../__tests__/rendererHarness';
import { ENGINE_SHADERS } from '../engineShaders';
import { LightingEngine } from '../LightingEngine';
import { LightingWorld } from '../LightingWorld';
import { failedEngineShaders } from '../shaderCheck';
import type { EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';

const SIZE = 256;
const walls: WallSegment[] = [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 500, y: 100 }, p2: { x: 500, y: 500 } }];
const scene: EngineScene = {
  bounds: { width: 1024, height: 1024 },
  albedo: null,
  walls,
  lights: [{ key: 'l', x: 300, y: 300, bright: 60, dim: 120, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'torch' }],
  sight: SEES_ALL,
  sightRadius: 20,
  ambient: 0,
};

describe('LightingEngine on a graphics device that cannot run it', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(): Promise<{ renderer: WebGLRenderer; engine: LightingEngine; error: ReturnType<typeof vi.spyOn> }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setMode('player');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    return { renderer, engine, error };
  }

  /** Every program link fails from now on, as on a driver that rejects the shaders. */
  function breakLinking(renderer: WebGLRenderer): void {
    const { gl } = renderer;
    const original = gl.getProgramParameter.bind(gl);
    vi.spyOn(gl, 'getProgramParameter').mockImplementation((program: WebGLProgram, name: number): unknown => (name === gl.LINK_STATUS ? false : original(program, name)));
    vi.spyOn(gl, 'getProgramInfoLog').mockReturnValue('C:\\fakepath(12,3): error X3511: unable to unroll loop');
  }

  function litAt(engine: LightingEngine, renderer: WebGLRenderer): number {
    return renderThroughEngine(engine, renderer, { size: SIZE, scale: 0.5, x: -22, y: -22 })(128, 128)[0];
  }

  function expectStopped(engine: LightingEngine, renderer: WebGLRenderer): void {
    expect(engine.failed).toBe(true);
    expect(engine.layer.visible).toBe(false);
    expect(engine.layer.filters).toBeNull();
    expect(engine.hasWorld()).toBe(false);
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
  }

  it('links every engine shader on this device', async () => {
    const { renderer } = await setup();
    expect(failedEngineShaders(renderer.gl)).toEqual([]);
  });

  it('names a shader that does not compile, with the driver\'s log', async () => {
    const { renderer } = await setup();
    const broken = { ...ENGINE_SHADERS.lightMap, name: 'broken', fragment: ENGINE_SHADERS.lightMap.fragment.replace('float dim = max', 'float dim = nonsense') };
    const failures = failedEngineShaders(renderer.gl, [ENGINE_SHADERS.capsuleField, broken]);
    expect(failures.map((failure) => failure.name)).toEqual(['broken']);
    expect(failures[0]!.log).toContain('nonsense');
    expect(renderer.gl.getError()).toBe(renderer.gl.NO_ERROR);
  });

  it('checks its shaders before the first build: one logged error with name and driver log, and the engine stops', async () => {
    const { renderer, engine, error } = await setup();
    const build = vi.spyOn(LightingWorld.prototype, 'update');
    engine.setEnabled(true);
    breakLinking(renderer);

    expect(() => engine.update(scene)).not.toThrow();

    expect(build).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    const message = String(error.mock.calls[0]![0]);
    expect(message).toContain('atlas-capsule-field');
    expect(message).toContain('atlas-lighting-composite');
    expect(message).toContain('error X3511');
    expectStopped(engine, renderer);
  });

  it('stays stopped: later updates, frames and switching on do nothing', async () => {
    const { renderer, engine, error } = await setup();
    engine.setEnabled(true);
    breakLinking(renderer);
    engine.update(scene);
    vi.restoreAllMocks();

    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();
    expect(engine.animate(performance.now())).toBe(false);
    expectStopped(engine, renderer);
    expect(error).toHaveBeenCalledOnce();
  });

  it.each(['update', 'animate', 'flush'] as const)('stops instead of throwing when a pass throws inside %s', async (entry) => {
    const { renderer, engine, error } = await setup();
    engine.setEnabled(true);
    if (entry !== 'update') engine.update(scene);
    vi.spyOn(LightingWorld.prototype, entry === 'update' ? 'update' : 'animate').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'value')");
    });

    expect(() => {
      if (entry === 'update') engine.update(scene);
      else if (entry === 'animate') engine.animate(performance.now() + 1000);
      else engine.flush();
    }).not.toThrow();

    expect(error).toHaveBeenCalledOnce();
    expectStopped(engine, renderer);
  });

  it('renders nothing inside PIXI\'s context runner, and rebuilds from the last scene at its next call', async () => {
    const { renderer, engine } = await setup();
    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();
    expect(litAt(engine, renderer)).toBeGreaterThan(150);
    const render = vi.spyOn(renderer, 'render');

    renderer.runners.contextChange.emit(renderer.gl);

    expect(render).not.toHaveBeenCalled();
    expect(engine.takeRestored()).toBe(true);
    expect(engine.takeRestored()).toBe(false);
    engine.flush();
    expect(render).toHaveBeenCalled();
    expect(engine.failed).toBe(false);
    expect(litAt(engine, renderer)).toBeGreaterThan(150);
  });

  it('checks its shaders again on a restored context, and stops when they no longer link', async () => {
    const { renderer, engine, error } = await setup();
    engine.setEnabled(true);
    engine.update(scene);
    engine.flush();
    await resetContext(renderer);
    breakLinking(renderer);

    expect(() => engine.update(scene)).not.toThrow();

    expect(error).toHaveBeenCalledOnce();
    expectStopped(engine, renderer);
  });

  it('draws nothing while the context is lost, without stopping, and builds once it is back', async () => {
    const { renderer, engine, error } = await setup();
    engine.setEnabled(true);
    const render = vi.spyOn(renderer, 'render');
    await resetContext(renderer, () => {
      engine.update(scene);
      engine.flush();
      expect(engine.animate(performance.now())).toBe(false);
      expect(render).not.toHaveBeenCalled();
      expect(engine.failed).toBe(false);
    });
    engine.flush();
    expect(engine.hasWorld()).toBe(true);
    expect(litAt(engine, renderer)).toBeGreaterThan(150);
    expect(error).not.toHaveBeenCalled();
  });
});
