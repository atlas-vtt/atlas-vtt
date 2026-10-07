import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { LaserBeamFrame, LaserBeamView } from '../../src/app/pixi/laser/LaserBeam';
import { LaserHub } from '../../src/app/pixi/laser/LaserHub';
import { RemoteLaserRenderer } from '../../src/app/pixi/laser/RemoteLaserRenderer';
import { LASER_PLAYBACK_DELAY_MS } from '../../src/app/pixi/laser/remoteLasers';
import { LASER_FADE_TIME } from '../../src/app/tools/laserPointerSettings';
import { manualTicker } from '../mocks/manualTicker';

class FakeBeam implements LaserBeamView {
  readonly view = new Container();
  readonly frames: LaserBeamFrame[] = [];
  destroyed = false;
  draw(frame: LaserBeamFrame): void { this.frames.push(frame); }
  destroy(): void { this.destroyed = true; }
}

describe('RemoteLaserRenderer', () => {
  it("draws each player's laser in its colour while it lasts, then frees its beam and stops ticking", () => {
    const { ticker, advance } = manualTicker();
    let now = 0;
    const beams: FakeBeam[] = [];
    const hub = new LaserHub();
    const renderer = new RemoteLaserRenderer({
      ticker, zoom: () => 2, hub, now: () => now,
      createBeam: () => {
        const beam = new FakeBeam();
        beams.push(beam);
        return beam;
      },
    });
    hub.showRemote({ from: 'p1', color: '#ff9f2e', points: [{ x: 5, y: 5 }], lifted: false });
    now = LASER_PLAYBACK_DELAY_MS;
    advance(16);
    expect(beams).toHaveLength(1);
    expect(renderer.container.children).toContain(beams[0]!.view);
    expect(beams[0]!.frames.at(-1)).toMatchObject({ color: '#ff9f2e', pointer: { x: 5, y: 5 }, dot: null, zoom: 2 });

    hub.showRemote({ from: 'p1', color: '#ff9f2e', points: [], lifted: true });
    now = LASER_PLAYBACK_DELAY_MS + LASER_FADE_TIME;
    advance(16);
    expect(beams[0]!.destroyed).toBe(true);
    expect(renderer.container.children).toHaveLength(0);
    expect(ticker.count).toBe(0);
    renderer.destroy();
  });

  it('leaves nothing behind when destroyed while lasers are on screen', () => {
    const { ticker, advance } = manualTicker();
    let now = 0;
    const beams: FakeBeam[] = [];
    const hub = new LaserHub();
    const renderer = new RemoteLaserRenderer({
      ticker, zoom: () => 1, hub, now: () => now,
      createBeam: () => { const beam = new FakeBeam(); beams.push(beam); return beam; },
    });
    for (const from of ['p1', 'p2']) hub.showRemote({ from, color: '#ff9f2e', points: [{ x: 1, y: 1 }], lifted: false });
    now = LASER_PLAYBACK_DELAY_MS;
    advance(16);
    expect(beams).toHaveLength(2);
    expect(ticker.count).toBe(1);
    renderer.destroy();
    expect(ticker.count).toBe(0);
    expect(beams.every((beam) => beam.destroyed && beam.view.destroyed)).toBe(true);
    expect(renderer.container.destroyed).toBe(true);
    // The hub no longer reaches it, and showing again starts nothing.
    hub.showRemote({ from: 'p1', color: '#ff9f2e', points: [{ x: 1, y: 1 }], lifted: false });
    advance(16);
    expect(ticker.count).toBe(0);
    expect(beams).toHaveLength(2);
  });
});
