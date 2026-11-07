// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Graphics, Text, type FillInstruction } from 'pixi.js';
import { contrast } from '../../src/app/pixi/lighting/lightMarker';
import { MeasureLabel, watchMeasureLabelTheme } from '../../src/app/pixi/utils/measureLabel';
import { forgetObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';

/** WCAG AA for normal text. */
const AA = 4.5;
const ACCENTS = ['#7b6cd9', '#e93147', '#ffd60a', '#00c7be', '#ffffff', '#000000'];

function setTheme(dark: boolean): void {
  document.body.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('theme-light', !dark);
}

function setAccent(accent: string): void {
  document.body.style.setProperty('--interactive-accent', accent);
  forgetObsidianAccentColor();
}

function over(color: number, alpha: number, below: number): number {
  const channel = (shift: number): number => Math.round(((color >> shift) & 0xff) * alpha + ((below >> shift) & 0xff) * (1 - alpha));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The label as drawn: its text colour, its pill's colour and the colour of the pill's rim. */
function drawnLabel(): { ink: number; pill: number; border: number } {
  const label = new MeasureLabel();
  label.show('35 ft', { beside: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, 1, 70);
  const pill = label.view.children.find((child): child is Graphics => child instanceof Graphics);
  const fills = pill?.context.instructions.filter((instruction): instruction is FillInstruction => instruction.action === 'fill') ?? [];
  const [rim, body] = fills.map((fill) => fill.data.style.color);
  if (rim === undefined || body === undefined) throw new Error('the pill has no fill');
  // The pill is opaque: whatever map lies under it, the text reads against it alone.
  expect(fills.every((fill) => fill.data.style.alpha === 1)).toBe(true);
  // The text lies on the pill at the nameplate's opacity.
  const ink = over(Number(label.text.style.fill), label.text.alpha, body);
  label.destroy();
  return { ink, pill: body, border: rim };
}

beforeEach(() => {
  // jsdom cannot measure text; the label's size plays no part in its colours.
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.style.removeProperty('--interactive-accent');
  forgetObsidianAccentColor();
});

describe('measure label contrast', () => {
  for (const dark of [false, true]) {
    for (const accent of ACCENTS) {
      it(`reads at AA in the ${dark ? 'dark' : 'light'} theme with accent ${accent}`, () => {
        setTheme(dark);
        setAccent(accent);
        const { ink, pill } = drawnLabel();
        expect(contrast(ink, pill)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('reads as the nameplate in the dark theme: white at its opacity on the dark badge grey, with a rim a little lighter', () => {
    setTheme(true);
    const { ink, pill, border } = drawnLabel();
    expect(pill).toBe(0x2a2a2a);
    expect(ink).toBe(over(0xffffff, 0.85, 0x2a2a2a));
    expect(border).toBeGreaterThan(pill);
  });

  it('redraws when the theme switches', async () => {
    setTheme(true);
    let redraws = 0;
    const stop = watchMeasureLabelTheme(() => { redraws++; });
    setTheme(false);
    await Promise.resolve();
    document.body.classList.add('is-focused');
    await Promise.resolve();
    stop();
    setTheme(true);
    await Promise.resolve();
    document.body.classList.remove('is-focused');
    expect(redraws).toBe(1);
  });
});
