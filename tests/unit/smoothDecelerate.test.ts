// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Viewport } from 'pixi-viewport';
import type { EventSystem } from 'pixi.js';
import { SmoothDecelerate } from '../../src/app/pixi/SmoothDecelerate';

const viewports: Viewport[] = [];

function createCoastingViewport(velocity = 1): { viewport: Viewport; decelerate: SmoothDecelerate } {
  const viewport = new Viewport({ noTicker: true, events: { domElement: createEl('canvas') } as EventSystem });
  const decelerate = new SmoothDecelerate(viewport);
  viewport.plugins.add('decelerate', decelerate);
  decelerate.activate({ x: velocity, y: 0 });
  viewports.push(viewport);
  return { viewport, decelerate };
}

/** Runs frames until the coast stops; returns the elapsed time. */
function runUntilStopped(viewport: Viewport, decelerate: SmoothDecelerate, frameMs = 16): number {
  let elapsed = 0;
  while (decelerate.isActive() && elapsed < 5000) {
    viewport.update(frameMs);
    elapsed += frameMs;
  }
  return elapsed;
}

afterEach(() => {
  viewports.splice(0).forEach(viewport => viewport.destroy());
  vi.restoreAllMocks();
});

describe('SmoothDecelerate', () => {
  it('brakes a coast to a quick, gradual stop when the map is pressed', () => {
    const { viewport, decelerate } = createCoastingViewport();
    viewport.update(16);
    decelerate.down();

    const start = viewport.x;
    viewport.update(16);
    const firstStep = viewport.x - start;
    viewport.update(16);
    const secondStep = viewport.x - start - firstStep;
    expect(firstStep).toBeGreaterThan(0);
    expect(secondStep).toBeGreaterThan(0);
    expect(secondStep).toBeLessThan(firstStep);

    expect(runUntilStopped(viewport, decelerate)).toBeLessThan(250);
    expect(viewport.x - start).toBeGreaterThan(30);
    expect(viewport.x - start).toBeLessThan(40);
  });

  it('brakes a fast coast harder so the map never slides far after the press', () => {
    const { viewport, decelerate } = createCoastingViewport(5);
    decelerate.down();
    runUntilStopped(viewport, decelerate);
    expect(viewport.x).toBeGreaterThan(40);
    expect(viewport.x).toBeLessThanOrEqual(48);
  });

  it('brakes over the same distance at any frame rate', () => {
    const at60 = createCoastingViewport();
    const at120 = createCoastingViewport();
    at60.decelerate.down();
    at120.decelerate.down();
    runUntilStopped(at60.viewport, at60.decelerate, 1000 / 60);
    runUntilStopped(at120.viewport, at120.decelerate, 1000 / 120);
    expect(at120.viewport.x).toBeCloseTo(at60.viewport.x, 0);
  });

  it('does not coast again when the press is released while braking', () => {
    const { viewport, decelerate } = createCoastingViewport();
    decelerate.down();
    viewport.update(16);
    decelerate.up();
    expect(runUntilStopped(viewport, decelerate)).toBeLessThan(250);
  });

  it('hands the map to a new drag at once', () => {
    const { viewport, decelerate } = createCoastingViewport();
    decelerate.down();
    viewport.update(16);
    viewport.emit('drag-start', { event: {} as never, screen: {} as never, world: {} as never, viewport });
    expect(decelerate.isActive()).toBe(false);
  });

  it('stops at once with reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { viewport, decelerate } = createCoastingViewport();
    decelerate.down();
    const start = viewport.x;
    viewport.update(16);
    expect(decelerate.isActive()).toBe(false);
    expect(viewport.x).toBe(start);
  });
});
