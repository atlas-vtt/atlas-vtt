// @vitest-environment jsdom
import { Point, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import { TouchNavigation } from '../../../src/app/pixi/input/TouchNavigation';
import { SmoothWheelZoom } from '../../../src/app/pixi/SmoothWheelZoom';

const viewports: Viewport[] = [];
afterEach(() => viewports.splice(0).forEach((viewport) => viewport.destroy()));

function view(): { viewport: Viewport; wheel: SmoothWheelZoom; navigation: TouchNavigation } {
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, noTicker: true, events: { domElement: document.createElement('canvas') } as unknown as EventSystem });
  viewport.clampZoom({ minScale: 0.1, maxScale: 5 });
  const wheel = new SmoothWheelZoom(viewport, { wheelZoom: true, trackpadPinch: false });
  viewport.plugins.add('wheel', wheel);
  viewports.push(viewport);
  return { viewport, wheel, navigation: new TouchNavigation(viewport) };
}

describe('fingers that take the map', () => {
  it('end a step of zoom that still glides once they move it: a pan is not zoomed under the finger', () => {
    const { viewport, wheel, navigation } = view();
    navigation.zoomStep(400, 300, 1);
    wheel.update(16);
    const gliding = viewport.scale.x;
    expect(gliding).toBeGreaterThan(1);
    expect(gliding).toBeLessThan(2);

    navigation.begin();
    navigation.pan(10, 0);
    wheel.update(16);
    wheel.update(16);
    expect(viewport.scale.x).toBe(gliding);
  });

  it('end a camera on its way somewhere (Fit, a token brought into view) once they move it', () => {
    const { viewport, navigation } = view();
    viewport.animate({ position: { x: 2000, y: 2000 }, scale: 3, time: 400 });
    expect(viewport.plugins.get('animate', true)).toBeTruthy();
    navigation.begin();
    navigation.pinch(400, 300, 100, 400, 300, 110);
    expect(viewport.plugins.get('animate', true)).toBeFalsy();
    const { x, y } = viewport.center;
    viewport.update(100);
    expect(viewport.center.x).toBe(x);
    expect(viewport.center.y).toBe(y);
  });

  it('leave the zoom of a tap to finish while they only rest: the fingers of the next tap move nothing', () => {
    const { viewport, wheel, navigation } = view();
    navigation.zoomStep(400, 300, -1);
    wheel.update(16);
    const gliding = viewport.scale.x;
    navigation.begin();
    wheel.update(16);
    expect(viewport.scale.x).toBeLessThan(gliding);
    navigation.end(false);
  });

  it('pinch about the point between them all the same', () => {
    const { viewport, navigation } = view();
    const under = viewport.toWorld(new Point(400, 300));
    navigation.begin();
    navigation.pinch(400, 300, 100, 400, 300, 200);
    expect(viewport.scale.x).toBeCloseTo(2, 6);
    const still = viewport.toWorld(new Point(400, 300));
    expect(still.x).toBeCloseTo(under.x, 6);
    expect(still.y).toBeCloseTo(under.y, 6);
  });
});
