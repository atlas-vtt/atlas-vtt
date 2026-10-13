import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Graphics, Text, type FillInstruction } from 'pixi.js';
import { contrast } from '../../src/app/pixi/lighting/lightMarker';
import { createMeasureLabelText, drawMeasureLabel, watchMeasureLabelTheme } from '../../src/app/pixi/utils/measureDrawing';
import { forgetObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';

/** WCAG AA for normal text. */
const AA = 4.5;
const ACCENTS = ['#7b6cd9', '#e93147', '#ffd60a', '#00c7be', '#ffffff', '#000000'];
/** The map under the pill: its lightest and darkest. */
const MAPS = [0xffffff, 0x000000];

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

/** The label as drawn: its text colour and its pill's fill. */
function drawnLabel(): { ink: number; pill: number; alpha: number } {
  const pill = new Graphics();
  const text = createMeasureLabelText();
  text.text = '35 ft';
  drawMeasureLabel(pill, text, { x: 0, y: 0 }, 1);
  const fill = pill.context.instructions.find((instruction): instruction is FillInstruction => instruction.action === 'fill');
  if (!fill) throw new Error('the pill has no fill');
  return { ink: Number(text.style.fill), pill: fill.data.style.color, alpha: fill.data.style.alpha };
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
        const { ink, pill, alpha } = drawnLabel();
        for (const map of MAPS) expect(contrast(ink, over(pill, alpha, map))).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('keeps the dark theme as it was: white on the dark badge grey', () => {
    setTheme(true);
    expect(drawnLabel()).toEqual({ ink: 0xffffff, pill: 0x2a2a2a, alpha: 0.95 });
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
