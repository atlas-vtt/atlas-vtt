// @vitest-environment jsdom
import { Container, Point, type PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { expect, it } from 'vitest';
import { FogCursorPreview } from '../../src/app/pixi/fog/FogCursorPreview';
import { ExploredOverlay } from '../../src/app/pixi/lighting/ExploredOverlay';
import { ShapeStroke } from '../../src/app/tools/shapeStroke';

/** A camera that zooms the world by 2 and then shifts it by `shift` on screen. */
class Camera extends Container {
  readonly zoom = 2;
  readonly shift = new Point();

  toScreen(x: number, y: number): Point {
    return new Point(x * this.zoom + this.shift.x, y * this.zoom + this.shift.y);
  }

  toWorld(screen: PointData): Point {
    return new Point((screen.x - this.shift.x) / this.zoom, (screen.y - this.shift.y) / this.zoom);
  }

  /** A scroll pan: the map moves, the pointer stays. */
  scrollBy(x: number, y: number): void {
    this.shift.x += x;
    this.shift.y += y;
    this.emit('moved', { viewport: this, type: 'wheel' });
  }
}

function ring(): { camera: Camera; cursor: FogCursorPreview } {
  const camera = new Camera();
  return { camera, cursor: new FogCursorPreview(camera as unknown as Viewport) };
}

it('stays under a pointer that stands still while the map is scrolled beneath it', () => {
  const { camera, cursor } = ring();
  cursor.show(false);
  cursor.updatePosition(50, 40);

  camera.scrollBy(-30, 10);

  const { x, y } = cursor.getDisplayObject().position;
  expect(camera.toScreen(x, y)).toEqual(new Point(100, 80));
  expect({ x, y }).toEqual({ x: 65, y: 35 });
});

it('is a light line over a dark one, both as wide on screen at any zoom', () => {
  const { camera, cursor } = ring();
  const graphics = cursor.getDisplayObject();
  const strokes: { width: number; color: number }[] = [];
  const stroke = graphics.stroke.bind(graphics);
  graphics.stroke = ((style: { width: number; color: number }) => {
    strokes.push({ width: style.width, color: style.color });
    return stroke(style);
  }) as typeof graphics.stroke;
  const drawn = (): { width: number; color: number }[] => strokes.splice(0);

  cursor.show(false);
  const [dark, light] = drawn();
  expect(dark).toEqual({ width: 4, color: 0x000000 });
  expect(light).toEqual({ width: 1.5, color: 0xffffff });

  // Zoomed in twice: half as wide in the world, so as wide on screen. The red line reveals.
  camera.scale.set(2);
  cursor.show(true);
  expect(drawn()).toEqual([{ width: 2, color: 0x000000 }, { width: 0.75, color: 0xff4444 }]);

  // A zoom by the wheel or by a key draws the lines anew; a pan draws nothing.
  cursor.updatePosition(50, 40);
  camera.scale.set(4);
  camera.scrollBy(0, 0);
  expect(drawn().map((line) => line.width)).toEqual([1, 0.375]);
  camera.scrollBy(10, 0);
  expect(drawn()).toEqual([]);
  camera.scale.set(1);
  cursor.updatePosition(60, 40);
  expect(drawn().map((line) => line.width)).toEqual([4, 1.5]);
  cursor.destroy();
});

it('stays where it was while it is hidden, and stops following once destroyed', () => {
  const { camera, cursor } = ring();
  cursor.show(false);
  cursor.updatePosition(50, 40);
  cursor.hide();

  camera.scrollBy(-30, 10);
  expect(cursor.getDisplayObject().position).toMatchObject({ x: 50, y: 40 });

  cursor.destroy();
  expect(camera.listenerCount('moved')).toBe(0);
});

it('keeps the explored memory brush ring where it followed the map when the brush only redraws', () => {
  const camera = new Camera();
  const overlay = new ExploredOverlay(camera as unknown as Viewport);
  const stroke = Object.assign(new ShapeStroke(), { mode: 'brush' });
  const pointer = { x: 50, y: 40 };
  overlay.drawCursor(pointer, stroke, 'reveal');

  camera.scrollBy(-30, 10);
  // A zoom or a new brush size redraws with the point the last pointer move gave.
  overlay.drawCursor(pointer, stroke, 'reveal');

  const ringView = overlay.view.children.at(-1)!;
  expect(camera.toScreen(ringView.x, ringView.y)).toEqual(new Point(100, 80));
  overlay.drawCursor({ x: 10, y: 10 }, stroke, 'reveal');
  expect(ringView.position).toMatchObject({ x: 10, y: 10 });
  overlay.destroy();
});
