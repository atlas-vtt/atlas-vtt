// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Viewport } from 'pixi-viewport';
import type { EventSystem, PointData } from 'pixi.js';
import { SmoothWheelZoom, approachScale, wheelZoomDoublings } from '../../src/app/pixi/SmoothWheelZoom';

const viewports: Viewport[] = [];
/** Scale factor of one 100px wheel notch with pixi-viewport's default sensitivity. */
const NOTCH = 2 ** (1.1 * 100 / 500);
const CURSOR = { x: 300, y: 200 };

function createViewport(options: { wheelZoom?: boolean; trackpadPinch?: boolean } = {}): Viewport {
  const events = {
    domElement: createEl('canvas'),
    mapPositionToPoint: (point: { set(x: number, y: number): void }, x: number, y: number) => point.set(x, y),
  } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 4000, worldHeight: 4000, noTicker: true, events });
  viewport.clampZoom({ minScale: 0.1, maxScale: 5 });
  viewport.plugins.add('wheel', new SmoothWheelZoom(viewport, { wheelZoom: true, trackpadPinch: false, ...options }));
  viewports.push(viewport);
  return viewport;
}

function spin(viewport: Viewport, deltaY: number, init: WheelEventInit = {}): void {
  const event = new WheelEvent('wheel', { deltaY, clientX: CURSOR.x, clientY: CURSOR.y, ...init });
  viewport.plugins.get<SmoothWheelZoom>('wheel')!.wheel(event);
}

function run(viewport: Viewport, frames: number, frameMs = 16): void {
  for (let i = 0; i < frames; i++) viewport.update(frameMs);
}

function worldUnderCursor(viewport: Viewport): PointData {
  return viewport.toWorld(CURSOR.x, CURSOR.y);
}

afterEach(() => {
  viewports.splice(0).forEach(viewport => viewport.destroy());
  vi.restoreAllMocks();
});

describe('wheelZoomDoublings', () => {
  const options = { percent: 0.1, reverse: false, lineHeight: 20 };

  it('zooms in when the wheel turns up and counts line deltas as lines', () => {
    expect(wheelZoomDoublings({ deltaY: -100, deltaMode: 0 }, options)).toBeCloseTo(0.22);
    expect(wheelZoomDoublings({ deltaY: 5, deltaMode: 1 }, options)).toBeCloseTo(-0.22);
  });

  it('limits accelerated flicks to one doubling per event', () => {
    expect(wheelZoomDoublings({ deltaY: -5000, deltaMode: 0 }, options)).toBe(1);
  });
});

describe('approachScale', () => {
  it('eases toward the target independently of the frame rate', () => {
    let at60 = 1;
    let at120 = 1;
    for (let i = 0; i < 6; i++) at60 = approachScale(at60, 2, 1000 / 60);
    for (let i = 0; i < 12; i++) at120 = approachScale(at120, 2, 1000 / 120);
    expect(at60).toBeGreaterThan(1);
    expect(at60).toBeLessThan(2);
    expect(at120).toBeCloseTo(at60, 10);
  });

  it('snaps once the rest of the way is imperceptible', () => {
    expect(approachScale(1.99999, 2, 16)).toBe(2);
  });
});

describe('SmoothWheelZoom', () => {
  it('glides to the notch zoom while the map point under the cursor stays put', () => {
    const viewport = createViewport();
    const anchor = worldUnderCursor(viewport);
    spin(viewport, -100);
    expect(viewport.scale.x).toBe(1);

    run(viewport, 1);
    expect(viewport.scale.x).toBeGreaterThan(1);
    expect(viewport.scale.x).toBeLessThan(NOTCH);
    expect(worldUnderCursor(viewport).x).toBeCloseTo(anchor.x);
    expect(worldUnderCursor(viewport).y).toBeCloseTo(anchor.y);

    run(viewport, 60);
    expect(viewport.scale.x).toBeCloseTo(NOTCH, 10);
    expect(worldUnderCursor(viewport).x).toBeCloseTo(anchor.x);
  });

  it('blends quick notches into one zoom', () => {
    const viewport = createViewport();
    spin(viewport, -100);
    run(viewport, 2);
    spin(viewport, -100);
    run(viewport, 60);
    expect(viewport.scale.x).toBeCloseTo(NOTCH * NOTCH, 10);
  });

  it('stops the target at the zoom limit so zooming back out responds at once', () => {
    const viewport = createViewport();
    viewport.setZoom(4.9);
    for (let i = 0; i < 10; i++) spin(viewport, -100);
    run(viewport, 60);
    expect(viewport.scale.x).toBe(5);

    spin(viewport, 100);
    run(viewport, 60);
    expect(viewport.scale.x).toBeCloseTo(5 / NOTCH, 10);
  });

  it('yields to anything else that zooms the viewport meanwhile', () => {
    const viewport = createViewport();
    spin(viewport, -100);
    run(viewport, 1);
    viewport.setZoom(2);
    run(viewport, 60);
    expect(viewport.scale.x).toBe(2);
  });

  it('freezes where it is when the map is grabbed', () => {
    const viewport = createViewport();
    spin(viewport, -100);
    run(viewport, 1);
    const grabbed = viewport.scale.x;
    viewport.plugins.get<SmoothWheelZoom>('wheel')!.down();
    run(viewport, 60);
    expect(viewport.scale.x).toBe(grabbed);
  });

  it('applies trackpad pinches directly', () => {
    const viewport = createViewport({ wheelZoom: false, trackpadPinch: true });
    spin(viewport, -10, { ctrlKey: true });
    expect(viewport.scale.x).toBeGreaterThan(1);
  });

  it('jumps straight to the new zoom with reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const viewport = createViewport();
    spin(viewport, -100);
    expect(viewport.scale.x).toBeCloseTo(NOTCH, 10);
  });
});
