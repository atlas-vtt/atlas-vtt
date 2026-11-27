import { describe, expect, it } from 'vitest';
import { DICE_COLOUR_OPTIONS, parseHex, type DiceFont, type Rgb } from '../../../src/app/dice3d/diceLook';
import { resolveLook, type ResolvedLook } from '../../../src/app/dice3d/dieSkin';
import { shownContrast, shownLuminance } from '../../../src/app/dice3d/stageTone';
import { DICE_SET_COLOURS } from '../../../src/app/gameSystems/diceSets';

/** WCAG AA for large text: a lone die's numerals stand some 29 px tall on the roll stage. */
const AA_LARGE = 3;

function rgb(hex: string | null): Rgb {
  const parsed = parseHex(hex ?? '');
  if (parsed === null) throw new Error(`not a colour: ${hex}`);
  return parsed;
}

/** A die in `colour` as a dice set or the theme's accent gives it one (`dieColours.ts`). */
function coloured(colour: Rgb, font: DiceFont = 'scifi'): ResolvedLook {
  return resolveLook({ colour: 'accent', font }, colour);
}

/** Every built-in look with a body of its own colour, and every colour a dice set offers. */
function builtInLooks(): [string, ResolvedLook][] {
  const fonts: DiceFont[] = ['medieval', 'scifi'];
  return fonts.flatMap((font) => [
    ...DICE_COLOUR_OPTIONS.filter(({ value }) => value !== 'light').map(({ value }): [string, ResolvedLook] => [`${font} ${value}`, resolveLook({ colour: value, font }, null)]),
    ...DICE_SET_COLOURS.map(({ value, label }): [string, ResolvedLook] => [`${font} set ${label}`, coloured(rgb(value), font)]),
  ]);
}

describe('numerals on a coloured die', () => {
  it('read on every built-in colour as the stage shows its face', () => {
    for (const [name, look] of builtInLooks()) {
      expect(shownContrast(rgb(look.ink), rgb(look.body)), `${name}: ${look.ink} on ${look.body}`).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('read on any colour a set or the theme gives a die', () => {
    const steps = Array.from({ length: 16 }, (_, i) => i * 17);
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const look = coloured([r, g, b]);
          expect(shownContrast(rgb(look.ink), [r, g, b]), `${look.ink} on ${look.body}`).toBeGreaterThanOrEqual(AA_LARGE);
        }
      }
    }
  });

  it('are dark in the body\'s own hue, not black, where they are dark', () => {
    const order = ([r, g, b]: Rgb): string => (['r', 'g', 'b'] as const).map((name, i) => [name, [r, g, b][i]!] as const).sort((x, y) => y[1] - x[1]).map(([name]) => name).join('');
    for (const [name, look] of builtInLooks()) {
      const [ink, body] = [rgb(look.ink), rgb(look.body)];
      if (shownLuminance(ink) > shownLuminance(body)) continue;
      expect(order(ink), `${name}: ${look.ink} on ${look.body}`).toBe(order(body));
    }
  });

  it('keep light numerals on dark dice', () => {
    expect(resolveLook({ colour: 'dark', font: 'scifi' }, null).ink).toBe('#e2e8f0');
    expect(coloured(rgb('#1f1e21')).ink).toBe('#e2e8f0');
    expect(coloured(rgb('#4338ca')).ink).toBe('#e2e8f0');
  });
});

describe('the stage\'s view of a colour', () => {
  it('is the luminance the stage drew faces and numerals with', () => {
    // Painted colour and the median of its pixels on a d20's top face, as
    // tests/gpu/diceNumeralContrast.gpu.test.ts measured them on 2026-11-25.
    const drawn: [string, string][] = [
      ['#1f1e21', '#443937'], ['#e2e8f0', '#edeeef'], ['#8a5cf5', '#d49bf1'], ['#c0392b', '#f97351'],
      ['#d9822b', '#f5c46a'], ['#c9a227', '#edd775'], ['#6b8f3a', '#b6ca6d'], ['#2a9d8f', '#8ad4c0'],
      ['#3b82c4', '#8bc0e0'], ['#d46a8a', '#f5b0bc'], ['#b91c1c', '#f95142'], ['#ea580c', '#ffa250'],
      ['#ca8a04', '#efc95b'], ['#4d7c0f', '#93b942'], ['#0f766e', '#4cb39b'], ['#1d4ed8', '#6280ea'],
      ['#4338ca', '#8660e5'], ['#7e22ce', '#cc4be6'], ['#be185d', '#fb5286'], ['#e7dcc3', '#efece4'],
      ['#64748b', '#abb1ba'], ['#4d110b', '#782c29'], ['#062c27', '#264841'], ['#2d1b56', '#4a3583'],
      ['#312503', '#504025'], ['#082064', '#243a96'], ['#510524', '#7e243d'], ['#292721', '#46433a'],
    ];
    const asShown = ([r, g, b]: Rgb): number => {
      const linear = [r, g, b].map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    for (const [painted, shown] of drawn) {
      expect(Math.abs(shownLuminance(rgb(painted)) - asShown(rgb(shown))), `${painted} drawn as ${shown}`).toBeLessThan(0.01);
    }
  });
});
