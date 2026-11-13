// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Container, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { readText } from '../../src/app/annotations/annotationList';
import { TEXT_SETTLE_MS, TextSharpening } from '../../src/app/pixi/TextSharpening';
import { createTextElementView, TEXT_CONTENT_LABEL } from '../../src/app/pixi/textElementView';
import type { TextElement } from '../../src/app/types';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

/** The camera of a view 800 × 600 points large, and the loop its viewport shares with the app. */
class FakeViewport {
  x = 0;
  y = 0;
  scale = { x: 1, y: 1 };
  screenWidth = 800;
  screenHeight = 600;
  readonly listeners = new Set<() => void>();
  readonly options = {
    ticker: {
      add: (listener: () => void): void => void this.listeners.add(listener),
      remove: (listener: () => void): void => void this.listeners.delete(listener),
    },
  };

  /** Shows the world around (`centerX`, `centerY`) at `zoom`. */
  show(zoom: number, centerX = 400, centerY = 300): void {
    this.scale = { x: zoom, y: zoom };
    this.x = this.screenWidth / 2 - centerX * zoom;
    this.y = this.screenHeight / 2 - centerY * zoom;
  }

  tick(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

interface Harness {
  viewport: FakeViewport;
  sharpening: TextSharpening;
  clock: { now: number };
  deviceRatio: { value: number };
  add(id: string, element?: Partial<TextElement>): { view: Container; text: Text };
}

let restoreGraphics: () => void = () => {};

function setup(deviceRatio = 1): Harness {
  const viewport = new FakeViewport();
  const clock = { now: 1000 };
  const ratio = { value: deviceRatio };
  const sharpening = new TextSharpening(
    viewport as unknown as Viewport,
    { resolution: () => ratio.value, maxTextureSide: () => 16384 },
    () => clock.now,
  );
  return {
    viewport,
    sharpening,
    clock,
    deviceRatio: ratio,
    add: (id, element = {}) => {
      const view = createTextElementView(readText(id, { id, kind: 'text', x: 400, y: 300, text: 'Guard room', fontSize: 24, fontFamily: 'serif', color: '#ffffff', ...element })!);
      sharpening.track(id, view);
      return { view, text: view.getChildByLabel(TEXT_CONTENT_LABEL) as Text };
    },
  };
}

/** Runs a frame, lets camera and regions rest, and runs the frame after. */
function rest(h: Harness): void {
  h.viewport.tick();
  h.clock.now += TEXT_SETTLE_MS;
  h.viewport.tick();
}

describe('TextSharpening', () => {
  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
  });

  afterEach(() => {
    restoreGraphics();
  });

  it('gives a new text the resolution its screen needs before it is first drawn', () => {
    const h = setup(2);
    h.viewport.show(2);
    expect(h.add('a').text.resolution).toBe(4);
  });

  it('draws a text anew once per doubling of the zoom, in the frame the zoom crosses it', () => {
    const h = setup();
    const { text } = h.add('a');
    const drawn: number[] = [];
    let last = text.resolution;
    for (let zoom = 1; zoom <= 5; zoom += 0.05) {
      h.viewport.show(zoom);
      h.viewport.tick();
      if (text.resolution !== last) drawn.push(text.resolution);
      last = text.resolution;
      // Never stretched on screen.
      expect(text.resolution).toBeGreaterThanOrEqual(zoom - 1e-9);
    }
    expect(drawn).toEqual([2, 4, 8]);
  });

  it('gives pixels back only once the camera has rested', () => {
    const h = setup();
    const { text } = h.add('a');
    h.viewport.show(4);
    h.viewport.tick();
    expect(text.resolution).toBe(4);

    h.viewport.show(1);
    h.viewport.tick();
    h.clock.now += TEXT_SETTLE_MS - 1;
    h.viewport.tick();
    expect(text.resolution).toBe(4);

    // A camera that moves on keeps the wait going.
    h.viewport.show(1.1);
    h.viewport.tick();
    h.clock.now += TEXT_SETTLE_MS - 1;
    h.viewport.tick();
    expect(text.resolution).toBe(4);

    h.clock.now += 1;
    h.viewport.tick();
    expect(text.resolution).toBe(2);
  });

  it('counts a text\'s own scale, also while a handle scales its view alone', () => {
    const h = setup();
    const { view, text } = h.add('a', { scale: 3 });
    expect(text.resolution).toBe(4);
    h.viewport.tick();

    // Nothing tells of a scale set on the view, and an idle frame looks at no text.
    view.scale.set(5);
    h.viewport.tick();
    expect(text.resolution).toBe(4);
    h.sharpening.touch();
    h.viewport.tick();
    expect(text.resolution).toBe(8);
  });

  it('keeps a text no picture shows at the least resolution, and sharpens it as it comes near the screen', () => {
    const h = setup();
    const { text } = h.add('far', { x: 5000, y: 300 });
    h.viewport.show(4, 400, 300);
    h.viewport.tick();
    expect(text.resolution).toBe(1);

    // Half a screen (100 world units at this zoom) past the right edge at 4800.
    h.viewport.show(4, 4700, 300);
    h.viewport.tick();
    expect(text.resolution).toBe(1);
    h.viewport.show(4, 4840, 300);
    h.viewport.tick();
    expect(text.resolution).toBe(4);

    h.viewport.show(4, 400, 300);
    rest(h);
    expect(text.resolution).toBe(1);
  });

  it('follows the screen\'s pixels to a point', () => {
    const h = setup(1);
    const { text } = h.add('a');
    h.deviceRatio.value = 2;
    h.viewport.tick();
    expect(text.resolution).toBe(2);
  });

  it('draws a text as fine as the finest picture that shows it, at once for a region and until it is let go', () => {
    const h = setup();
    const { text } = h.add('a');
    const far = h.add('far', { x: 9000, y: 9000 }).text;
    // The player window's frame: eight device pixels to a world unit around the text.
    const release = h.sharpening.addDemandRegion({ rect: { x: 300, y: 200, width: 200, height: 200 }, worldPerScreenPixel: 1 / 8 });
    expect(text.resolution).toBe(8);
    expect(far.resolution).toBe(1);

    // The view's own zoom is coarser, and changes nothing while the frame is shown.
    h.viewport.show(2);
    rest(h);
    expect(text.resolution).toBe(8);

    release();
    h.viewport.tick();
    expect(text.resolution).toBe(8);
    rest(h);
    expect(text.resolution).toBe(2);
  });

  it('follows a frame that is replaced by a finer one without ever going coarser between them', () => {
    const h = setup();
    const { text } = h.add('a');
    const seen: number[] = [];
    let release = h.sharpening.addDemandRegion({ rect: { x: 0, y: 0, width: 800, height: 600 }, worldPerScreenPixel: 1 / 3 });
    for (const pixels of [3.5, 4, 4.5]) {
      release();
      release = h.sharpening.addDemandRegion({ rect: { x: 0, y: 0, width: 800, height: 600 }, worldPerScreenPixel: 1 / pixels });
      h.viewport.tick();
      seen.push(text.resolution);
    }
    expect(seen).toEqual([4, 4, 8]);
  });

  it('holds a huge text to the texture limits', () => {
    const h = setup(2);
    h.viewport.show(5);
    const { text } = h.add('a', { text: 'x'.repeat(100), scale: 5 });
    // 800 units wide in the stub's measure: 4096 pixels are the longest side.
    expect(text.resolution).toBeLessThan(6);
    expect(Math.ceil(800 * text.resolution)).toBe(4096);
  });

  it('counts the room a text\'s picture keeps around its letters: an Outline text is held to the limits with it', () => {
    const h = setup(2);
    h.viewport.show(5);
    const plain = h.add('a', { text: 'x'.repeat(100), scale: 5 }).text;
    const outlined = h.add('b', { text: 'x'.repeat(100), scale: 5, outline: true }).text;
    const side = (text: Text): number => Math.ceil((text.getLocalBounds().width + 2 * text.style.padding) * text.resolution);
    expect(outlined.style.padding).toBeGreaterThan(0);
    expect(outlined.resolution).toBeLessThan(plain.resolution);
    // Its picture fills the longest side the limits allow, and never passes it.
    expect(side(outlined)).toBeLessThanOrEqual(4096);
    expect(side(outlined)).toBeGreaterThan(4096 - 8);
    expect(Math.ceil(plain.getLocalBounds().width * outlined.resolution)).toBeLessThan(4096 - 8);
  });

  it('leaves the halo out of a text that is too small on every picture, and draws it once a picture shows it large enough', () => {
    const h = setup();
    const halo = (text: Text): number => text.style.stroke?.width ?? 0;
    // 24 high: under 12 pixels below half of the map's size.
    h.viewport.show(0.25);
    const { text } = h.add('a', { outline: true });
    expect(halo(text)).toBe(0);
    h.viewport.show(1);
    h.viewport.tick();
    expect(halo(text)).toBeGreaterThan(0);
    h.viewport.show(0.25);
    h.viewport.tick();
    expect(halo(text)).toBe(0);
    // A players' frame that shows it large keeps the halo, whatever the GM's camera.
    const release = h.sharpening.addDemandRegion({ rect: { x: 0, y: 0, width: 800, height: 600 }, worldPerScreenPixel: 1 });
    expect(halo(text)).toBeGreaterThan(0);
    release();
    // A text no picture shows keeps what it has.
    h.viewport.show(1, 9000, 9000);
    rest(h);
    expect(halo(text)).toBeGreaterThan(0);
  });

  it('measures an edited text again', () => {
    const h = setup(2);
    h.viewport.show(5);
    const { view, text } = h.add('a', { text: 'x'.repeat(100) });
    const capped = text.resolution;
    text.text = 'Gate';
    h.sharpening.track('a', view);
    expect(text.resolution).toBe(16);
    expect(capped).toBeLessThan(16);
  });

  it('runs in the view\'s loop only while there are texts', () => {
    const h = setup();
    expect(h.viewport.listeners.size).toBe(0);
    h.add('a');
    h.add('b');
    expect(h.viewport.listeners.size).toBe(1);
    h.sharpening.forget('a');
    expect(h.viewport.listeners.size).toBe(1);
    h.sharpening.forget('b');
    expect(h.viewport.listeners.size).toBe(0);
    h.add('c');
    h.sharpening.destroy();
    expect(h.viewport.listeners.size).toBe(0);
  });
});
