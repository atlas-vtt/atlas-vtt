import { describe, expect, it } from 'vitest';
import { DARK_INK, LIGHT_INK, isDiceColour, isDiceFont, parseHex, readableInk } from '../../../src/app/dice3d/diceLook';
import { resolveLook } from '../../../src/app/dice3d/dieSkin';

describe('dice look', () => {
  it('writes dark numerals on light accents and light numerals on dark ones', () => {
    expect(readableInk([0xf5, 0xd0, 0x4c])).toBe(DARK_INK); // yellow
    expect(readableInk([0x7c, 0xe3, 0xa1])).toBe(DARK_INK); // mint
    expect(readableInk([0x1e, 0x3a, 0x8a])).toBe(LIGHT_INK); // navy
    expect(readableInk([0x8a, 0x5c, 0xf5])).toBe(LIGHT_INK); // Obsidian purple, as Obsidian writes on it
    expect(readableInk([0xe0, 0x3e, 0x3e])).toBe(LIGHT_INK); // red
    expect(readableInk([0xf5, 0x9e, 0x0b])).toBe(DARK_INK); // orange
  });

  it('reads only #rrggbb colours', () => {
    expect(parseHex('#8a5cf5')).toEqual([0x8a, 0x5c, 0xf5]);
    expect(parseHex('hsl(254, 80%, 66%)')).toBeNull();
  });

  it('keeps the light medieval dice exactly as drawn', () => {
    expect(resolveLook({ colour: 'light', font: 'medieval' }, null)).toMatchObject({ body: null, ink: null });
    expect(resolveLook({ colour: 'light', font: 'scifi' }, null)).toMatchObject({ body: null, ink: DARK_INK });
  });

  it('inverts the dark dice and colours the accent dice with readable numerals', () => {
    expect(resolveLook({ colour: 'dark', font: 'medieval' }, null).ink).toBe(LIGHT_INK);
    expect(resolveLook({ colour: 'accent', font: 'scifi' }, [0xf5, 0xd0, 0x4c])).toMatchObject({ body: '#f5d04c', ink: DARK_INK });
    // Without an accent from the theme, Obsidian's default purple stands in.
    expect(resolveLook({ colour: 'accent', font: 'medieval' }, null).body).toBe('#8a5cf5');
  });

  it('dyes preset dice in the Appearance colour, whatever the accent', () => {
    expect(resolveLook({ colour: 'gold', font: 'medieval' }, [0x1e, 0x3a, 0x8a])).toMatchObject({ body: '#c9a227', ink: DARK_INK });
    expect(resolveLook({ colour: 'azure', font: 'scifi' }, null)).toMatchObject({ body: '#3b82c4', ink: LIGHT_INK });
  });

  it('knows its options', () => {
    expect(isDiceColour('accent')).toBe(true);
    expect(isDiceColour('gold')).toBe(true);
    expect(isDiceColour('#c9a227')).toBe(false);
    expect(isDiceFont('scifi')).toBe(true);
  });
});
