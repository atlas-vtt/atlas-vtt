import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOG_EDGE, HARD_FOG_EDGE } from '../../src/app/fog/fogEdge';
import { MOTION_NORMAL_MS } from '../../src/app/utils/motion';
import type { FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogScenes } from '../helpers/fogCoverageScene';

/**
 * PIXI's word for a texture that was destroyed while a shader's resources still named it: the
 * shader is left without that resource, and the console gets the warning the maintainer saw
 * ("a 'textureSource' was destroyed while still bound to a shader"). The fog's shaders hold the
 * fog's canvas and, during a fade, the picture before it; both are replaced through the fog's life.
 */
const bound: string[] = [];
beforeEach(() => {
  bound.length = 0;
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (text.includes('destroyed while still bound')) bound.push(text);
  });
});
// Set before the scenes' own cleanup, so it runs after it: the fog's end is part of its life.
afterEach(() => {
  expect(bound).toEqual([]);
});

const scenes = fogScenes({ fades: true });
type Scene = Awaited<ReturnType<typeof scenes.scene>>;

const rect = (id: string, timestamp: number, x: number, y: number, width: number, height: number): FogRectangleFill =>
  ({ id, timestamp, kind: 'fog', type: 'rectangle', x, y, width, height, isErasing: false });
const ROOM = rect('room', 2, 16, 16, 56, 56);
const KEPT = rect('kept', 1, 88, 88, 32, 32);
const both = (...ops: FogOperation[]): Record<string, FogOperation> => Object.fromEntries(ops.map((op) => [op.id, op]));
const MAP = { x: 0, y: 0, width: 128, height: 128 };
const SMALLER_MAP = { x: 0, y: 0, width: 96, height: 96 };

/** A clock the test moves: the fade's frames come as the test asks for them. */
function steppedClock(): (ms: number) => void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  return (ms) => { vi.advanceTimersByTime(ms); };
}

async function scene(edge = DEFAULT_FOG_EDGE): Promise<Scene> {
  const s = await scenes.scene(both(KEPT, ROOM));
  s.fog.setEdge(edge);
  s.showMapImage(MAP);
  s.rgba();
  return s;
}

describe.each([['a crackled edge', DEFAULT_FOG_EDGE], ['a hard edge', HARD_FOG_EDGE]])('the fog\'s textures, with %s', (_name, edge) => {
  it('are let go of by the shaders before they are destroyed, through a fade from its start to its end', async () => {
    const s = await scene(edge);
    const advance = steppedClock();

    s.setFog(both(KEPT));
    expect(s.fog.fading).toBe(true);
    s.rgba();
    advance(40);
    s.rgba();
    // A change during the fade: it goes on from a picture of its own, and the one before goes
    s.setFog(both(KEPT, ROOM));
    s.rgba();
    advance(40);
    s.rgba();
    advance(MOTION_NORMAL_MS * 2);
    expect(s.fog.fading).toBe(false);
    s.rgba();
  });

  it('are let go of when the fog\'s canvas takes another size, at rest and during a fade', async () => {
    const s = await scene(edge);
    const advance = steppedClock();

    s.showMapImage(SMALLER_MAP);
    s.rgba();
    s.setFog(both(KEPT));
    advance(40);
    s.rgba();
    expect(s.fog.fading).toBe(true);
    s.showMapImage(MAP);
    expect(s.fog.fading).toBe(false);
    s.rgba();
  });

  it('are let go of when the scene changes and when the edge does', async () => {
    const s = await scene(edge);
    const advance = steppedClock();

    s.setFog(both(KEPT));
    advance(40);
    s.rgba();
    s.fog.setEdge(edge === HARD_FOG_EDGE ? DEFAULT_FOG_EDGE : HARD_FOG_EDGE);
    s.rgba();
    s.setFog(both(KEPT, ROOM));
    advance(40);
    s.rgba();
    // Another scene: a load, with a map of another size
    s.store.setState({ isMapLoading: true });
    s.store.setState((state) => ({ mapPath: 'maps/b.atlasmap', objects: { ...state.objects, fog: both(ROOM) } }));
    s.showMapImage(SMALLER_MAP);
    s.store.setState({ isMapLoading: false });
    s.rgba();
  });

  it('are let go of when the fog is destroyed in the middle of a fade', async () => {
    const s = await scene(edge);
    const advance = steppedClock();

    s.setFog(both(KEPT));
    advance(40);
    s.rgba();
    expect(s.fog.fading).toBe(true);
    // The scenes' cleanup destroys the fog now
  });
});
