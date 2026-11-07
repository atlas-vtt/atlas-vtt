// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { PlayerSightMarks } from '../../src/app/pixi/lighting/PlayerSightMarks';
import type { SightMark } from '../../src/app/pixi/lighting/sightMarks';
import { createLucideIconTexture } from '../../src/app/pixi/utils/lucideIconTexture';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

// jsdom has no 2D canvas, so the SVG rasteriser cannot run here.
vi.mock('../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));

const mark = (tokenId: string, kind: SightMark['kind'] = 'unseen'): SightMark => ({ tokenId, kind, x: 10, y: 20 });
const badges = (marks: PlayerSightMarks): Container[] => marks.view.children as Container[];
const eye = (badge: Container): Sprite | undefined => badge.children.find((child): child is Sprite => child instanceof Sprite);

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.classList.remove('theme-dark');
  vi.mocked(createLucideIconTexture).mockClear();
});

function setup(): PlayerSightMarks {
  const restoreGraphics = stubJsdomGraphics();
  const marks = new PlayerSightMarks();
  cleanup = () => {
    marks.destroy();
    restoreGraphics();
  };
  return marks;
}

describe('PlayerSightMarks', () => {
  it('draws the badge many times larger than it shows, so its circles stay round when the map is zoomed in', () => {
    const marks = setup();
    marks.sync([mark('a', 'sensed')], 1);
    const shape = badges(marks)[0]!.children[0] as Graphics;
    expect(shape).toBeInstanceOf(Graphics);
    expect(shape.scale.x).toBe(1 / 16);
    // 11 UI units of radius and half a unit of hairline on each side, drawn 16 times larger.
    expect(shape.getLocalBounds().width).toBeCloseTo((11 + 1) * 2 * 16, 0);
  });

  it('gives every unseen badge an eye from one white texture, tinted in the theme\'s ink, and a sensed badge none', async () => {
    const marks = setup();
    marks.sync([mark('a'), mark('b'), mark('c', 'sensed')], 1);
    await vi.waitFor(() => expect(eye(badges(marks)[1]!)).toBeDefined());
    const [first, second, sensed] = badges(marks);
    expect(eye(first!)!.texture).toBe(eye(second!)!.texture);
    expect(createLucideIconTexture).toHaveBeenCalledTimes(1);
    expect(createLucideIconTexture).toHaveBeenCalledWith(expect.any(String), 'white', 192);
    expect(eye(first!)!.tint).toBe(0x000000);
    expect(eye(first!)!.width).toBeCloseTo(15);
    expect(eye(first!)!.texture.source.autoGenerateMipmaps).toBe(true);
    expect(eye(sensed!)).toBeUndefined();
  });

  it('draws a badge anew in the other theme, its eye in that theme\'s ink from the same texture', async () => {
    const marks = setup();
    marks.sync([mark('a')], 1);
    await vi.waitFor(() => expect(eye(badges(marks)[0]!)).toBeDefined());
    const light = badges(marks)[0]!;
    const { texture } = eye(light)!;
    document.body.classList.add('theme-dark');
    marks.sync([mark('a')], 1);
    expect(light.destroyed).toBe(true);
    await vi.waitFor(() => expect(eye(badges(marks)[0]!)).toBeDefined());
    expect(eye(badges(marks)[0]!)!.tint).toBe(0xffffff);
    expect(eye(badges(marks)[0]!)!.texture).toBe(texture);
    expect(createLucideIconTexture).toHaveBeenCalledTimes(1);
  });

  it('leaves a badge alone that went before its eye arrived, and destroys the texture with the marks', async () => {
    const marks = setup();
    marks.sync([mark('a')], 1);
    const gone = badges(marks)[0]!;
    marks.sync([], 1);
    expect(gone.destroyed).toBe(true);
    const texture = await vi.mocked(createLucideIconTexture).mock.results[0]!.value as Texture;
    const destroy = vi.spyOn(texture, 'destroy');
    await Promise.resolve();
    cleanup!();
    cleanup = null;
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledWith(true));
    expect(eye(gone)).toBeUndefined();
  });
});
