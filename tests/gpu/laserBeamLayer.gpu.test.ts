import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { LaserBeam, beamWidth } from '../../src/app/pixi/laser/LaserBeam';
import { copiedPixel } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';

const SIZE = 256;

/**
 * The beam draws into a layer of its own, sized to the beam. A scene thumbnail renders the
 * viewport off-screen, which makes it a render group for good (issue #213): the layer must
 * still cover the beam there, or the beam is cut away and shows only in parts of the map.
 */
describe('the laser beam inside a viewport', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(): Promise<{ app: Application; world: Container; beam: LaserBeam }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000 });
    cleanup.push(() => app.destroy(true, { children: true }));
    const world = new Container();
    // A white map: the beam blends with max into its layer, so drawn without one it vanishes here
    world.addChild(new Graphics().rect(0, 0, 8000, 8000).fill(0xffffff));
    const beam = new LaserBeam();
    cleanup.push(() => beam.destroy());
    world.addChild(beam.view);
    app.stage.addChild(world);
    return { app, world, beam };
  }

  /** Whether the beam shows red over the white map at its pointer, for each place and zoom. */
  function missedPlaces({ app, world, beam }: { app: Application; world: Container; beam: LaserBeam }): string[] {
    const missed: string[] = [];
    for (const zoom of [0.25, 1, 3]) {
      for (const [wx, wy] of [[300, 300], [1290, 810], [4000, 6000]] as const) {
        world.scale.set(zoom);
        world.position.set(SIZE / 2 - wx * zoom, SIZE / 2 - wy * zoom);
        const trail = [{ x: wx - 30 / zoom, y: wy, life: 0.9 }, { x: wx, y: wy, life: 1 }];
        beam.draw({ trail, dot: null, pointer: null, color: '#ff0000', width: beamWidth(12, zoom), zoom });
        app.render();
        const [r, g, b] = copiedPixel(app.canvas, SIZE / 2 - 5, SIZE / 2);
        if (!(r! > 200 && g! < 120 && b! < 120)) missed.push(`zoom ${zoom} at ${wx},${wy}: ${r},${g},${b}`);
      }
    }
    return missed;
  }

  it('shows the beam everywhere', async () => {
    expect(missedPlaces(await setup())).toEqual([]);
  });

  it('shows the beam everywhere once a thumbnail has rendered the viewport', async () => {
    const scene = await setup();
    scene.app.renderer.generateTexture({ target: scene.world, frame: new Rectangle(0, 0, 64, 64) }).destroy(true);
    expect(scene.world.renderGroup).toBeTruthy();
    expect(missedPlaces(scene)).toEqual([]);
  });
});
