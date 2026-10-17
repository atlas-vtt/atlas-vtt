import { describe, expect, it } from 'vitest';
import { fogRect, fogScenes } from '../helpers/fogCoverageScene';

const { scene } = fogScenes();
/** The floor is white. */
const FLOOR = 255;
/** Red of a pixel at least nine tenths under clouds of the default colour (about 35 where they are whole). */
const CLOUDED = 60;

describe('cloud reveal in the players\' frame', () => {
  it('covers every point of the fog with clouds and leaves the floor beyond the soft edge', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setFogStyle({ clouds: true });
    // The fog is the square 16..80. Clouds cover it to its edge, and soften beyond it.
    for (const [x, y] of [[48, 48], [17, 48], [79, 48], [48, 17], [48, 79], [18, 18], [78, 78]] as const) {
      expect(s.read(x, y), `inside the fog at ${x}, ${y}`).toBeLessThan(CLOUDED);
    }
    for (const [x, y] of [[124, 124], [124, 48], [48, 124]] as const) {
      expect(s.read(x, y), `outside the fog at ${x}, ${y}`).toBe(FLOOR);
    }
  });

  it('keeps players under the fog from before an edit while the GM erases it', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setFogStyle({ clouds: true });
    s.store.getState().setActiveTool('eraser');
    s.setFog({ paint: fogRect(), erase: fogRect('erase', 2, true) });
    expect(s.read(48, 48)).toBeLessThan(CLOUDED);
    // The GM edits on the flat fog, which shows the erased square already.
    expect(s.read(48, 48, false)).toBe(FLOOR);
  });

  it('changes no edge that stayed when a transition starts or ends', async () => {
    const s = await scene({ paint: fogRect() });
    s.showMapImage({ x: 0, y: 0, width: 128, height: 128 });
    s.store.getState().setFogStyle({ clouds: true });
    // The left edge of the square, which the change below leaves where it is
    const edge = (): number[] => Array.from({ length: 16 }, (_, i) => s.read(4 + i, 48));
    const before = edge();

    s.setFog({ paint: fogRect(), more: { ...fogRect('more', 2), x: 96, y: 96, width: 24, height: 24 } });
    const layer = (s.fog as unknown as { cloudLayer: { isRevealing: boolean; transition: { cancel(): void }; applyTransition(progress: number): void; finishTransition(): void } }).cloudLayer;
    expect(layer.isRevealing).toBe(true);
    layer.transition.cancel();
    const near = (values: number[]): void => values.forEach((value, i) => expect(Math.abs(value - before[i]!), `x ${4 + i}: ${value} against ${before[i]}`).toBeLessThanOrEqual(2));

    layer.applyTransition(0);
    near(edge());
    layer.applyTransition(1);
    near(edge());
    layer.finishTransition();
    near(edge());
  });
});

