import '../setup/obsidianDom';
import { Application, EventBoundary, FederatedPointerEvent, Graphics, RenderTexture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { readText } from '../../src/app/annotations/annotationList';
import type { DrawFont, TextLook } from '../../src/app/annotations/annotationTypes';
import { FONT_FAMILIES, TEXT_PLATE } from '../../src/app/annotations/madeText';
import { HALO } from '../../src/app/annotations/textLook';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { textLayout } from '../../src/app/pixi/textLayout';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TextElement } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('events', async () => import('eventemitter3'));

const WIDTH = 1000;
const HEIGHT = 640;
const FONTS: readonly DrawFont[] = ['medieval', 'scifi', 'mono'];
/** Where the looks' pictures go when `VITE_DRAW_LOOKS` asks for them, beside this file (the test server writes nowhere else). */
const LOOKS_FOLDER = '__screenshots__/text-looks';
const wantsPictures = Boolean(import.meta.env.VITE_DRAW_LOOKS);

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Scene {
  app: Application;
  host: HTMLElement;
  viewport: Viewport;
  store: ViewAtlasStore;
  annotations: AnnotationsRenderer;
  /** Looks at the world point (x, y) at `zoom`, lets the view's tick follow, and draws the canvas. */
  look(x: number, y: number, zoom: number): void;
  /** One frame of the view: its tick and its picture. */
  frame(): void;
  /** A double click on the map at the world point (x, y), as the viewport's dispatch hands it on. */
  doubleClick(x: number, y: number): void;
  /** A press, moves and release on the map, in world points. */
  drag(path: readonly (readonly [number, number])[]): void;
  field(): HTMLTextAreaElement | null;
  /** What the window shows of the map view: the canvas and whatever lies over it. */
  shot(): Promise<Pixels>;
  /** What the canvas draws for the players' frame (`players`), or as it is. */
  picture(layers: readonly LayerVisibility[]): Pixels;
}

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

const style = document.createElement('style');
// The caret blinks and a selection tints the letters: neither is ink of the text.
style.textContent = `${css}
  body { margin: 0; background: #000; }
  .atlas-map-text-field__input { caret-color: transparent !important; }
  .atlas-map-text-field__input::selection { background: transparent; color: inherit; }`;

beforeAll(async () => {
  document.head.append(style);
  await page.viewport(WIDTH + 40, HEIGHT + 40);
  await Promise.all(Object.values(FONT_FAMILIES).map((family) => document.fonts.load(`16px "${family}"`)));
});

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function decoded(base64: string): Promise<Pixels> {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}

async function open(background = 0x000000): Promise<Scene> {
  const host = document.body.createDiv();
  Object.assign(host.style, { position: 'relative', width: `${WIDTH}px`, height: `${HEIGHT}px`, overflow: 'hidden' });
  const app = new Application();
  await app.init({ width: WIDTH, height: HEIGHT, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: background, resolution: 1 });
  host.append(app.canvas);
  Object.assign(app.canvas.style, { position: 'absolute', left: '0', top: '0' });
  const viewport = new Viewport({ screenWidth: WIDTH, screenHeight: HEIGHT, worldWidth: 4000, worldHeight: 4000, events: app.renderer.events, ticker: app.ticker });
  viewport.sortableChildren = true;
  app.stage.addChild(viewport);
  const store = createViewAtlasStore(createInMemoryApp().app, `text-field-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/text.atlasmap');
  let clock = 0;
  const annotations = new AnnotationsRenderer({ viewport, store, grid: () => null, now: () => clock, sharpness: { resolution: () => 1, maxTextureSide: () => 8192 } });
  cleanup.push(() => {
    annotations.destroy();
    viewport.destroy();
    app.destroy(true, { children: true });
    host.remove();
  });
  const boundary = new EventBoundary(viewport);
  const eventAt = (x: number, y: number): FederatedPointerEvent => {
    const event = new FederatedPointerEvent(boundary);
    event.button = 0;
    const screen = viewport.toScreen(x, y);
    event.global.set(screen.x, screen.y);
    return event;
  };
  const frame = (): void => {
    app.ticker.update(performance.now());
    app.render();
  };
  const scene: Scene = {
    app, host, viewport, store, annotations, frame,
    look: (x, y, zoom) => {
      viewport.setZoom(zoom, true);
      viewport.moveCenter(x, y);
      frame();
      // The texts take the resolution the camera asks for in the tick after it moved.
      frame();
    },
    doubleClick: (x, y) => {
      for (const soon of [false, true]) {
        clock += soon ? 10 : 2000;
        annotations.selecting.pointer.pointerDown(x, y, eventAt(x, y));
        viewport.emit('pointerup', eventAt(x, y));
      }
    },
    drag: (path) => {
      const [first, ...rest] = path;
      const last = path[path.length - 1]!;
      viewport.emit('pointerdown', eventAt(first![0], first![1]));
      for (const [x, y] of rest) viewport.emit('pointermove', eventAt(x, y));
      viewport.emit('pointerup', eventAt(last[0], last[1]));
    },
    field: () => host.querySelector('textarea'),
    shot: async () => {
      frame();
      await nextFrame();
      return decoded(await page.screenshot({ element: host, save: false }));
    },
    picture: (layers) => {
      const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
      let pixels: Pixels = { data: new Uint8ClampedArray(), width: WIDTH, height: HEIGHT };
      captureWithLayerVisibility(layers, () => undefined, () => {
        app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
        pixels = { data: app.renderer.extract.pixels({ target }).pixels, width: WIDTH, height: HEIGHT };
      });
      target.destroy(true);
      return pixels;
    },
  };
  return scene;
}

const lightAt = ({ data }: Pixels, index: number): number => 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;

/** The pixels of `pixels` that are ink: lighter than `from` on a black ground. */
function ink(pixels: Pixels, from: number): Uint8Array {
  const mask = new Uint8Array(pixels.width * pixels.height);
  for (let i = 0; i < mask.length; i++) mask[i] = lightAt(pixels, i * 4) > from ? 1 : 0;
  return mask;
}

/**
 * How many pixels of clear ink in `a` have no ink at all within one pixel of them in `b`: none,
 * where the letters of `a` lie on those of `b` within a pixel.
 */
function strayInk(a: Pixels, b: Pixels): { stray: number; clear: number } {
  const clear = ink(a, 150);
  const any = ink(b, 50);
  let stray = 0;
  let count = 0;
  for (let y = 1; y < a.height - 1; y++) {
    for (let x = 1; x < a.width - 1; x++) {
      const i = y * a.width + x;
      if (!clear[i]) continue;
      count++;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = any[i + dy * a.width + dx] === 1;
      if (!near) stray++;
    }
  }
  return { stray, clear: count };
}

const inkBox = (pixels: Pixels, from = 100): { left: number; top: number; right: number; bottom: number; count: number } => {
  const mask = ink(pixels, from);
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, count: 0 };
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if (!mask[y * pixels.width + x]) continue;
      box.count++;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  }
  return box;
};

const label = (more: Partial<TextElement>): Omit<TextElement, 'id' | 'kind'> =>
  ({ x: 2000, y: 2000, text: 'Old Mill\nRoad', fontSize: 32, fontFamily: FONT_FAMILIES.medieval, color: '#ffffff', ...more });

describe('the field a map text is typed in', () => {
  const WORDS = { plain: 'Old Mill\nRoad', wrapped: 'The quick brown fox jumps over the lazy dog' };

  for (const font of FONTS) {
    for (const wraps of [false, true]) {
      it(`lies on the text within a pixel, in the ${font} face, ${wraps ? 'wrapped' : 'as wide as its words'}, at three zooms and two turns`, async () => {
        const s = await open();
        s.store.getState().setDrawTool({ mode: 'select' });
        s.store.getState().setActiveTool('draw');
        for (const rotation of [0, 30]) {
          const id = s.store.getState().addText(label({
            fontFamily: FONT_FAMILIES[font], rotation, text: wraps ? WORDS.wrapped : WORDS.plain,
            ...(wraps && { width: 260, align: 'left' as const }),
          }));
          s.store.getState().clearSelection();
          for (const zoom of [0.5, 1, 2.5]) {
            s.look(2000, 2000, zoom);
            const drawn = await s.shot();
            s.doubleClick(2000, 2000);
            const field = s.field();
            expect(field, `${rotation}° at ${zoom}`).not.toBeNull();
            field!.setSelectionRange(0, 0);
            const typed = await s.shot();
            // The text itself is hidden while its field shows: what is seen now is the field alone.
            const there = strayInk(drawn, typed);
            const back = strayInk(typed, drawn);
            expect(there.clear, `ink of the text, ${rotation}° at ${zoom}`).toBeGreaterThan(40);
            expect(back.clear, `ink of the field, ${rotation}° at ${zoom}`).toBeGreaterThan(40);
            expect([there.stray, back.stray], `${font} ${wraps ? 'wrapped' : ''} ${rotation}° at ${zoom}`).toEqual([0, 0]);
            // The same lines: a wrapped text breaks in the field where it breaks on the map.
            const [a, b] = [inkBox(drawn), inkBox(typed)];
            for (const side of ['left', 'top', 'right', 'bottom'] as const) expect(Math.abs(a[side] - b[side]), `${side}, ${rotation}° at ${zoom}`).toBeLessThanOrEqual(1);
            field!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(s.field()).toBeNull();
            s.store.getState().clearSelection();
          }
          s.store.getState().deleteAnnotations([id]);
        }
      });
    }
  }

  it('stands where the text will stand: what is typed lies where the map then draws it, for a click and for a drag', async () => {
    const s = await open();
    s.store.getState().setActiveTool('draw');
    for (const [align, path] of [['center', [[2000, 2000]]], ['left', [[1900, 1950], [2000, 1960], [2150, 1962]]]] as const) {
      s.store.getState().setDrawTool({ mode: 'text', font: 'medieval', look: 'plain', size: 'l', align });
      s.look(2000, 2000, 1.5);
      s.drag(path);
      const field = s.field()!;
      field.value = path.length > 1 ? 'The old mill by the river road' : 'Old Mill';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      const typed = await s.shot();
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(s.field()).toBeNull();
      // What was made is selected and framed: the frame is no ink of the text.
      s.store.getState().clearSelection();
      const drawn = await s.shot();
      expect([strayInk(drawn, typed).stray, strayInk(typed, drawn).stray], align).toEqual([0, 0]);
      expect(strayInk(drawn, typed).clear).toBeGreaterThan(200);
      s.store.getState().deleteAnnotations(Object.keys(s.store.getState().objects.texts));
    }
  });

  it('breaks its lines where the map\'s rule breaks them: at spaces, after hyphens, at dashes, and inside a word that is too long', () => {
    /** The lines a browser sets `text` in with the field's own styles, in a box `width` wide. */
    const fieldLines = (text: string, font: string, width: number): string[] => {
      const root = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-map-text-field atlas-map-text-field--wraps' });
      root.setCssProps({ '--atlas-text-field-font': font, '--atlas-text-field-line': '1.2em', '--atlas-text-field-width': `${width}px`, '--atlas-text-field-height': '2000px', '--atlas-text-field-room': '0px', '--atlas-text-field-shift': '0px' });
      const box = root.createDiv({ cls: 'atlas-map-text-field__input', text });
      const range = document.createRange();
      const lines: string[] = [''];
      let top = Number.NaN;
      for (let i = 0; i < text.length; i++) {
        range.setStart(box.firstChild!, i);
        range.setEnd(box.firstChild!, i + 1);
        const rect = [...range.getClientRects()].pop();
        if (!rect) continue;
        if (rect.top > top + 2) lines.push('');
        if (!(rect.top <= top + 2)) top = rect.top;
        lines[lines.length - 1] += text[i];
      }
      root.remove();
      return lines.map((line) => line.replace(/ +$/, ''));
    };
    const texts = [
      'Here be dragons, and the old mill by the river road where nobody goes at night',
      'The so-called "wolf-men" (were-wolves) \u2014 half-man, half-beast \u2014 of Mill-on-the-Marsh',
      'Room 12: trap! (DC15) 3d6+2 dmg; key=red? yes/no... rooms 10-20, at -5 or 3\u20134',
      'Supercalifragilisticexpialidocious and a.very.long.name@example.com',
    ];
    let compared = 0;
    for (const family of Object.values(FONT_FAMILIES)) {
      for (const size of [21, 49]) {
        for (let width = 3 * size; width < 14 * size; width += size * 0.83) {
          for (const text of texts) {
            const ours = textLayout(readText('t', { id: 't', kind: 'text', x: 0, y: 0, text, fontSize: size, fontFamily: family, color: '#ffffff', width })!).lines;
            expect(fieldLines(text, `${size}px "${family}"`, width), `${family} ${size} at ${width}`).toEqual(ours.map((line) => line.replace(/ +$/, '')));
            compared++;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(300);
  });

  it('is in no players\' frame, and neither is what is typed into it: the players see the text as the map has it until it is written', async () => {
    const s = await open();
    s.store.getState().setDrawTool({ mode: 'select' });
    s.store.getState().setActiveTool('draw');
    s.store.getState().addText(label({}));
    s.store.getState().clearSelection();
    s.look(2000, 2000, 1);
    const before = s.picture(s.annotations.getPlayerViewLayers());
    s.doubleClick(2000, 2000);
    const field = s.field()!;
    field.value = 'A secret door';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    s.frame();
    // The GM's canvas draws nothing of the text now: its field shows it.
    expect(inkBox(s.picture([])).count).toBe(0);
    // The players' frame, and a picture of the scene, draw the text as it was, pixel for pixel.
    for (const layers of [s.annotations.getPlayerViewLayers(), s.annotations.getPictureLayers()]) {
      const during = s.picture(layers);
      expect(inkBox(during).count).toBeGreaterThan(200);
      expect(during.data.every((value, index) => value === before.data[index])).toBe(true);
    }
    // And the canvas is as it was once the frame is over.
    expect(inkBox(s.picture([])).count).toBe(0);
  });
});

describe('the Outline look', () => {
  /** The lightness in `pixels` that is farthest from `ground`. */
  const farthest = (pixels: Pixels, ground: number): number => {
    let found = ground;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = lightAt(pixels, i);
      if (Math.abs(light - ground) > Math.abs(found - ground)) found = light;
    }
    return found;
  };
  /** The contrast of two lightnesses (0 to 255), as WCAG counts it. */
  const contrast = (a: number, b: number): number => {
    const linear = (value: number): number => ((value / 255) <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
    const [high, low] = [Math.max(linear(a), linear(b)), Math.min(linear(a), linear(b))];
    return (high + 0.05) / (low + 0.05);
  };

  for (const font of FONTS) {
    it(`keeps ${font} text readable on a ground of its own colour: white on white, black on black`, async () => {
      for (const [ground, color] of [[0xffffff, '#ffffff'], [0x000000, '#000000']] as const) {
        const s = await open(ground);
        s.store.getState().addText(label({ fontFamily: FONT_FAMILIES[font], color, outline: true, text: 'Old Mill' }));
        s.look(2000, 2000, 1);
        const pixels = s.picture([]);
        // The halo's line stands out from the ground it lies on as strongly as body text must from its page.
        const lightness = ground === 0xffffff ? 255 : 0;
        expect(contrast(farthest(pixels, lightness), lightness), `${color} on its own colour`).toBeGreaterThan(7);
        cleanup.pop()!();
      }
    });

    it(`cuts nothing of ${font} letters or their halo off, at the top, the bottom or the sides`, async () => {
      // A grey ground: the white letters and their dark halo both stand out from it.
      const GREY = 128;
      const s = await open(0x808080);
      const marks = (pixels: Pixels): ReturnType<typeof inkBox> => {
        const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, count: 0 };
        for (let y = 0; y < pixels.height; y++) {
          for (let x = 0; x < pixels.width; x++) {
            if (Math.abs(lightAt(pixels, (y * pixels.width + x) * 4) - GREY) < 40) continue;
            box.count++;
            box.left = Math.min(box.left, x);
            box.right = Math.max(box.right, x);
            box.top = Math.min(box.top, y);
            box.bottom = Math.max(box.bottom, y);
          }
        }
        return box;
      };
      // Tall, deep and slanted letters, and ones that reach past their own width.
      const id = s.store.getState().addText(label({ fontFamily: FONT_FAMILIES[font], text: 'jÅpqf|ÉQgy/', fontSize: 48, italic: true }));
      s.look(2000, 2000, 2);
      const bare = marks(s.picture([]));
      s.store.getState().updateText(id, { outline: true });
      s.frame();
      const haloed = marks(s.picture([]));
      // The halo stands out its share of 48 units at zoom 2 on every side: a side that grew by less was cut off.
      const halo = HALO.share * 48 * 2;
      for (const [side, grown] of [['left', bare.left - haloed.left], ['top', bare.top - haloed.top], ['right', haloed.right - bare.right], ['bottom', haloed.bottom - bare.bottom]] as const) {
        expect(grown, `${font} ${side}`).toBeGreaterThanOrEqual(halo - 2);
        expect(grown, `${font} ${side}`).toBeLessThanOrEqual(halo + 2);
      }
    });
  }

  it.skipIf(!wantsPictures)('writes pictures of the three looks in the three faces on a light and a dark map', async () => {
    const s = await open(0x333333);
    const ground = new Graphics({ zIndex: -1 });
    paintGround(ground);
    s.viewport.addChild(ground);
    const LOOKS: readonly TextLook[] = ['outline', 'plate', 'plain'];
    const rows = FONTS.flatMap((font) => [{ font, color: '#ffffff', size: 32 }, { font, color: '#2a1a0a', size: 32 }, { font, color: '#ffcc33', size: 21 }]);
    for (const [panel, top] of [[0, 0], [1, HEIGHT / 2]] as const) {
      rows.forEach((row, index) => LOOKS.forEach((look, column) => {
        s.store.getState().addText({
          x: 160 + column * 330, y: top + 20 + index * 35, text: `${panel === 0 ? 'Old Mill Road' : 'Thieves’ Guild'}`, fontSize: row.size, fontFamily: FONT_FAMILIES[row.font], color: row.color,
          ...(look === 'outline' && { outline: true as const }), ...(look === 'plate' && TEXT_PLATE),
        });
      }));
    }
    s.store.getState().clearSelection();
    for (const [name, x, y, zoom] of [['looks', WIDTH / 2, HEIGHT / 2, 1], ['looks-close-light', 330, 110, 3], ['looks-close-dark', 330, HEIGHT / 2 + 110, 3], ['looks-far', WIDTH / 2, HEIGHT / 2, 0.5]] as const) {
      s.look(x, y, zoom);
      s.frame();
      await nextFrame();
      await page.screenshot({ element: s.app.canvas, path: `${LOOKS_FOLDER}/${name}.png` });
    }
  });
});

describe.skipIf(!wantsPictures)('pictures of the field beside the text it stands on', () => {
  it('writes the Outline and the Plate look as the map draws them and as the field shows them', async () => {
    const s = await open(0x333333);
    const ground = new Graphics({ zIndex: -1 });
    paintGround(ground);
    s.viewport.addChild(ground);
    s.store.getState().setDrawTool({ mode: 'select' });
    s.store.getState().setActiveTool('draw');
    const looks = [
      { name: 'outline', x: 250, y: 120, more: { outline: true as const, fontFamily: FONT_FAMILIES.medieval } },
      { name: 'plate', x: 700, y: 120, more: { ...TEXT_PLATE, fontFamily: FONT_FAMILIES.scifi, rotation: 8 } },
      { name: 'wrapped', x: 480, y: 440, more: { outline: true as const, fontFamily: FONT_FAMILIES.mono, color: '#1b1a2e', width: 300, align: 'left' as const, text: 'The well-known half-orc of Mill-on-the-Marsh keeps the key' } },
    ];
    for (const look of looks) s.store.getState().addText(label({ x: look.x, y: look.y, text: 'Old Mill\nRoad', fontSize: 40, ...look.more }));
    s.store.getState().clearSelection();
    s.look(WIDTH / 2, HEIGHT / 2, 1);
    s.frame();
    await nextFrame();
    await page.screenshot({ element: s.host, path: `${LOOKS_FOLDER}/field-0-map.png` });
    for (const look of looks) {
      s.doubleClick(look.x, look.y);
      s.field()!.setSelectionRange(0, 0);
      s.frame();
      await nextFrame();
      await page.screenshot({ element: s.host, path: `${LOOKS_FOLDER}/field-${look.name}.png` });
      s.field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      s.store.getState().clearSelection();
    }
  });
});

/** A ground like a map's: parchment above and stone below, mottled, with a grid's lines and a few strong shapes. */
function paintGround(ground: Graphics): void {
  let seed = 11;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const panel = (top: number, base: number, speck: readonly number[]): void => {
    ground.rect(0, top, WIDTH, HEIGHT / 2).fill(base);
    for (let i = 0; i < 900; i++) {
      const size = 4 + random() * 26;
      ground.rect(random() * WIDTH, top + random() * (HEIGHT / 2 - size), size, size * (0.3 + random())).fill({ color: speck[Math.floor(random() * speck.length)]!, alpha: 0.25 + random() * 0.4 });
    }
    for (let x = 0; x < WIDTH; x += 70) ground.rect(x, top, 1.5, HEIGHT / 2).fill({ color: 0x000000, alpha: 0.35 });
    for (let y = top; y < top + HEIGHT / 2; y += 70) ground.rect(0, y, WIDTH, 1.5).fill({ color: 0x000000, alpha: 0.35 });
  };
  panel(0, 0xd9c9a0, [0xb9a476, 0xefe4c4, 0x8a7a55, 0x6f8f5a, 0xc8b68a]);
  panel(HEIGHT / 2, 0x2b2c33, [0x3d3f4a, 0x1b1c21, 0x54463a, 0x23303a, 0x4a4d57]);
}
