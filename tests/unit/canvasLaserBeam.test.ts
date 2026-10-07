import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { CanvasLaserBeam } from '../../src/app/pixi/laser/CanvasLaserBeam';
import type { LaserBeamFrame } from '../../src/app/pixi/laser/LaserBeam';
import { beamWidth } from '../../src/app/pixi/laser/laserBeamGeometry';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

function frame(changes: Partial<LaserBeamFrame>): LaserBeamFrame {
  return { trail: [], dot: null, pointer: null, color: '#ff0000', width: beamWidth(10, 1), zoom: 1, ...changes };
}

describe('CanvasLaserBeam', () => {
  let restoreGraphics: () => void;
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => restoreGraphics());

  it('draws with Graphics only, since the Canvas renderer has no meshes', () => {
    const beam = new CanvasLaserBeam();
    expect(beam.view).toBeInstanceOf(Graphics);
    expect(beam.view.children).toHaveLength(0);
  });

  it('covers the trail and hides once nothing is left to draw', () => {
    const beam = new CanvasLaserBeam();
    beam.draw(frame({ trail: [{ x: 0, y: 0, life: 1 }, { x: 100, y: 0, life: 1 }] }));
    expect(beam.view.visible).toBe(true);
    const bounds = beam.view.getLocalBounds();
    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.maxX).toBeGreaterThan(100);

    beam.draw(frame({}));
    expect(beam.view.visible).toBe(false);
  });

  it('shows the dot while the pointer hovers without drawing', () => {
    const beam = new CanvasLaserBeam();
    beam.draw(frame({ dot: { x: 50, y: 50, life: 1 } }));
    expect(beam.view.visible).toBe(true);
    const bounds = beam.view.getLocalBounds();
    expect(bounds.minX).toBeLessThan(50);
    expect(bounds.maxX).toBeGreaterThan(50);
  });

  it('keeps a spot on screen while the laser is held still', () => {
    const beam = new CanvasLaserBeam();
    beam.draw(frame({ trail: [{ x: 50, y: 50, life: 1 }] }));
    expect(beam.view.visible).toBe(true);
    const bounds = beam.view.getLocalBounds();
    expect(bounds.minX).toBeLessThan(50);
    expect(bounds.maxX).toBeGreaterThan(50);
  });
});
