import { describe, expect, it } from 'vitest';
import { DARK_INK, LIGHT_INK, isDiceColour, isDiceFont, parseHex } from '../../../src/app/dice3d/diceLook';
import { resolveLook } from '../../../src/app/dice3d/dieSkin';

describe('dice look', () => {
  it('reads only #rrggbb colours', () => {
    expect(parseHex('#8a5cf5')).toEqual([0x8a, 0x5c, 0xf5]);
    expect(parseHex('hsl(254, 80%, 66%)')).toBeNull();
  });

  it('keeps the light medieval dice exactly as drawn', () => {
    expect(resolveLook({ colour: 'light', font: 'medieval' }, null)).toMatchObject({ body: null, ink: null });
    expect(resolveLook({ colour: 'light', font: 'scifi' }, null)).toMatchObject({ body: null, ink: DARK_INK });
  });

  it('inverts the dark dice and colours the accent dice', () => {
    expect(resolveLook({ colour: 'dark', font: 'medieval' }, null).ink).toBe(LIGHT_INK);
    expect(resolveLook({ colour: 'accent', font: 'scifi' }, [0xf5, 0xd0, 0x4c]).body).toBe('#f5d04c');
    // Without an accent from the theme, Obsidian's default purple stands in.
    expect(resolveLook({ colour: 'accent', font: 'medieval' }, null).body).toBe('#8a5cf5');
  });

  it('dyes preset dice in the Appearance colour, whatever the accent', () => {
    expect(resolveLook({ colour: 'gold', font: 'medieval' }, [0x1e, 0x3a, 0x8a]).body).toBe('#c9a227');
    expect(resolveLook({ colour: 'azure', font: 'scifi' }, null).body).toBe('#3b82c4');
  });

  it('knows its options', () => {
    expect(isDiceColour('accent')).toBe(true);
    expect(isDiceColour('gold')).toBe(true);
    expect(isDiceColour('#c9a227')).toBe(false);
    expect(isDiceFont('scifi')).toBe(true);
  });
});
