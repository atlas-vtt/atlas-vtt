import { describe, expect, it, vi } from 'vitest';

const numerals = vi.hoisted(() => ({ marks: [] as Array<{ sides: number; value: number; ink: string | null }> }));
vi.mock('../../../src/app/dice3d/dieNumerals', async (original) => ({
  ...(await original<typeof import('../../../src/app/dice3d/dieNumerals')>()),
  paintNumeralMark: (_ctx: unknown, _x: number, _y: number, sides: number, mark: { value: number }, _font: string, ink: string | null) => {
    numerals.marks.push({ sides, value: mark.value, ink });
  },
}));

import type { LookArt } from '../../../src/app/dice3d/customLookArt';
import { artKey, artKeys, bodySides, planBody, warmBodies } from '../../../src/app/dice3d/dieBody';
import { resolveCustomLook, resolveLook, type ResolvedLook } from '../../../src/app/dice3d/dieSkin';
import { paintFaceMarks, paintFaceRelief } from '../../../src/app/dice3d/faceArt';
import { dieGeometry } from '../../../src/app/dice3d/dieGeometry';

const art = (name: string, width = 100, height = 100): HTMLCanvasElement => ({ name, width, height }) as unknown as HTMLCanvasElement;

function fakeContext(): { ctx: CanvasRenderingContext2D; drawn: Array<{ name: string; width: number; height: number; filter: string }> } {
  const drawn: Array<{ name: string; width: number; height: number; filter: string }> = [];
  const ctx = {
    filter: 'none',
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    drawImage(image: { name: string }, _x: number, _y: number, width: number, height: number) { drawn.push({ name: image.name, width, height, filter: this.filter }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

const lookWith = (faces: LookArt['faces'], bump: LookArt['bump'] = new Map()): ResolvedLook =>
  resolveCustomLook({ colour: 'light', font: 'medieval' }, { id: 'ext:look', body: '#203040', ink: null }, { faces, bump });

describe('the face art of a dice look', () => {
  it('keys the tens die by its tens, 00 for the face Atlas lands as 10, and every other body by its value', () => {
    expect(artKeys(100).sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(artKey(100, 10)).toBe(0);
    expect(artKey(100, 3)).toBe(30);
    expect(artKey(10, 10)).toBe(10);
    expect(artKeys(4)).toEqual([1, 2, 3, 4]);
    expect(bodySides(100)).toBe(10);
    // The tens die is a body of its own only while a registered look has tens art; otherwise it is a d10 like the units.
    expect(planBody({ sides: 10, role: 'tens' }, true)).toBe(100);
    expect(planBody({ sides: 10, role: 'tens' }, false)).toBe(10);
    expect(planBody({ sides: 10, role: 'units' }, true)).toBe(10);
    expect(warmBodies(false)).toEqual([4, 6, 8, 10, 12, 20]);
    expect(warmBodies(true)).toEqual([4, 6, 8, 10, 12, 20, 100]);
  });

  it('paints art where the look has some and Atlas numerals elsewhere, face by face', () => {
    numerals.marks = [];
    const { ctx, drawn } = fakeContext();
    const look = lookWith(new Map([[20, new Map([[20, art('twenty')]])]]));
    paintFaceMarks(ctx, 128, 128, 20, 20, look);
    paintFaceMarks(ctx, 128, 128, 20, 7, look);
    expect(drawn.map((entry) => entry.name)).toEqual(['twenty']);
    // A missing face gets Atlas's numeral in the ink that reads on the look's dark body.
    expect(numerals.marks).toEqual([{ sides: 20, value: 7, ink: '#e2e8f0' }]);
  });

  it("fits art into the face as large as its margin allows, keeping the art's shape", () => {
    const { ctx, drawn } = fakeContext();
    paintFaceMarks(ctx, 128, 128, 6, 1, lookWith(new Map([[6, new Map([[1, art('wide', 200, 100)]])]])));
    const [{ width, height }] = drawn as [{ width: number; height: number }];
    expect(width / height).toBeCloseTo(2);
    expect(width).toBeGreaterThan(100);
    expect(width).toBeLessThanOrEqual(256);
  });

  it('paints a d4 face three times, one per corner, each corner by its own value, falling back per corner', () => {
    numerals.marks = [];
    const { ctx, drawn } = fakeContext();
    // The face standing for 1 carries 4, 3 and 2 at its corners (dieGeometry's d4).
    const geometry = dieGeometry(4);
    expect(geometry.values[0]).toBe(1);
    paintFaceMarks(ctx, 128, 128, 4, 1, lookWith(new Map([[4, new Map([[4, art('four')], [2, art('two')]])]])));
    expect(drawn.map((entry) => entry.name).sort()).toEqual(['four', 'two']);
    expect(numerals.marks.map((mark) => mark.value)).toEqual([3]);
  });

  it('paints the tens die from its own art, by tens', () => {
    const { ctx, drawn } = fakeContext();
    const look = lookWith(new Map([[100, new Map([[0, art('double-zero')], [30, art('thirty')]])], [10, new Map([[10, art('ten')]])]]));
    paintFaceMarks(ctx, 128, 128, 100, 10, look);
    paintFaceMarks(ctx, 128, 128, 100, 3, look);
    paintFaceMarks(ctx, 128, 128, 10, 10, look);
    expect(drawn.map((entry) => entry.name)).toEqual(['double-zero', 'thirty', 'ten']);
  });

  it("presses the relief art in as given, else the face art's silhouette, else Atlas's numeral", () => {
    numerals.marks = [];
    const { ctx, drawn } = fakeContext();
    const look = lookWith(new Map([[6, new Map([[1, art('one')], [2, art('two')]])]]), new Map([[6, new Map([[1, art('one-relief')]])]]));
    for (const value of [1, 2, 3]) paintFaceRelief(ctx, 128, 128, 6, value, look);
    expect(drawn.map(({ name, filter }) => `${name}:${filter}`)).toEqual(['one-relief:grayscale(1)', 'two:brightness(0)']);
    expect(numerals.marks).toEqual([{ sides: 6, value: 3, ink: null }]);
  });

  it("Atlas's own look carries no art, so every face keeps its numeral", () => {
    numerals.marks = [];
    const { ctx, drawn } = fakeContext();
    const own = resolveLook({ colour: 'dark', font: 'scifi' }, null);
    expect(own).toMatchObject({ lookId: null, art: null });
    paintFaceMarks(ctx, 128, 128, 100, 10, own);
    expect(drawn).toHaveLength(0);
    expect(numerals.marks).toEqual([{ sides: 10, value: 10, ink: own.ink }]);
  });

  it("takes a look's body and ink, and only #rrggbb ones", () => {
    const empty = { faces: new Map(), bump: new Map() };
    expect(resolveCustomLook({ colour: 'dark', font: 'medieval' }, { id: 'a', body: null, ink: null }, empty)).toMatchObject({ body: null, ink: null, lookId: 'a' });
    expect(resolveCustomLook({ colour: 'light', font: 'scifi' }, { id: 'a', body: null, ink: null }, empty).ink).toBe('#1c1714');
    expect(resolveCustomLook({ colour: 'light', font: 'medieval' }, { id: 'a', body: '#ffffff', ink: '#112233' }, empty)).toMatchObject({ body: '#ffffff', ink: '#112233' });
    expect(resolveCustomLook({ colour: 'light', font: 'medieval' }, { id: 'a', body: 'url(x)', ink: 'red' }, empty)).toMatchObject({ body: null, ink: null });
  });
});
