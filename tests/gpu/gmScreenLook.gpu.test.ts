import { afterEach, describe, expect, it } from 'vitest';
import looksCss from '../../styles/looks/atlas-looks.css?inline';
import { CUSTOM_ACCENT_CLASS, LOOK_CLASS, SCIFI_LOOK_CLASS } from '../../src/app/appearance/atlasLook';
import { readLook } from '../../src/app/online/gmScreen/look/readLook.ts';
import { LOOK_COLOUR_VALUE, type LookColour } from '../../src/app/online/protocol/index.ts';
import { OBSIDIAN_DEFAULT_COLOURS } from './obsidianDefaultColours.ts';

afterEach(() => {
  document.head.querySelectorAll('style[data-look-test]').forEach((style) => style.remove());
  document.body.className = '';
  for (const name of ['--accent-h', '--accent-s', '--accent-l']) document.body.style.removeProperty(name);
});

function stylesheet(css: string): void {
  document.head.createEl('style', { text: css, attr: { 'data-look-test': '' } });
}

/** The GM's Obsidian: its default theme with Atlas's looks loaded, in `scheme`, with these body classes. */
function obsidian(scheme: 'light' | 'dark', ...classes: string[]): void {
  stylesheet(OBSIDIAN_DEFAULT_COLOURS);
  stylesheet(looksCss);
  document.body.addClass(`theme-${scheme}`, ...classes);
}

/** Hue, saturation and lightness of `#rrggbb`, as Obsidian writes a picked accent onto the body. */
function hslOf(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 1000) / 10, Math.round(l * 1000) / 10];
}

/** Picks `hex` as the accent, as Obsidian applies its Appearance setting, and Atlas marks it while a look is on. */
function pickAccent(hex: string): void {
  const [h, s, l] = hslOf(hex);
  document.body.style.setProperty('--accent-h', String(h));
  document.body.style.setProperty('--accent-s', `${s}%`);
  document.body.style.setProperty('--accent-l', `${l}%`);
  if (document.body.hasClass(LOOK_CLASS)) document.body.addClass(CUSTOM_ACCENT_CLASS);
}

/** `hsl(h, s%, l%)` as `#rrggbb`, with saturation and lightness clamped as CSS clamps them. */
function hslHex(h: number, s: number, l: number): string {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const light = Math.min(100, Math.max(0, l)) / 100;
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[f(0), f(8), f(4)].map((unit) => Math.round(unit * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** An accent Obsidian derives from the picked one: its hue moved by `dh`, saturation and lightness scaled. */
function derived(hex: string, dh: number, ds: number, dl: number): string {
  const [h, s, l] = hslOf(hex);
  return hslHex(h + dh, s * ds, l * dl);
}

/** Whether two colours are one, but for a step of rounding in a channel. */
function near(actual: string | undefined, expected: string): boolean {
  if (actual === undefined || actual.length !== expected.length) return false;
  for (let at = 1; at < expected.length; at += 2) if (Math.abs(parseInt(actual.slice(at, at + 2), 16) - parseInt(expected.slice(at, at + 2), 16)) > 1) return false;
  return true;
}

const read = (): Partial<Record<LookColour, string>> => readLook(document)?.colours ?? {};

const GREEN = '#2e9e44';
const ORANGE = '#e8772e';

describe('the look Atlas reads for a device', () => {
  it('reads the Medieval look by day: parchment, ink, the module\'s red, the accent of the look', () => {
    obsidian('light', LOOK_CLASS);
    const look = readLook(document);
    expect(look?.dark).toBe(false);
    expect(look?.colours).toMatchObject({
      '--background-primary': '#f5eddc', '--background-secondary': '#e9dec3', '--text-normal': '#3a2c1a', '--text-muted': '#6d5c40',
      '--text-accent': '#8a2b12', '--text-error': '#a41e22', '--interactive-normal': '#e2d5b6', '--atlas-theme-red': '#a41e22',
      '--color-accent': '#dd4646', '--background-modifier-hover': '#2a1e0e14', '--background-modifier-cover': '#3a2c1a52',
    });
    expect(near(look?.colours['--interactive-accent'], hslHex(-1, 69 * 1.01, 57 * 1.075))).toBe(true);
    for (const colour of Object.values(look?.colours ?? {})) expect(colour).toMatch(LOOK_COLOUR_VALUE);
  });

  it('reads the Medieval look by day with a picked green: the accent and what Obsidian and the look derive from it', () => {
    obsidian('light', LOOK_CLASS);
    pickAccent(GREEN);
    const colours = read();
    expect(colours['--background-primary']).toBe('#f5eddc');
    expect(near(colours['--color-accent'], GREEN)).toBe(true);
    expect(near(colours['--text-accent'], GREEN)).toBe(true);
    expect(near(colours['--interactive-accent'], derived(GREEN, -1, 1.01, 1.075))).toBe(true);
    expect(near(colours['--interactive-accent-hover'], derived(GREEN, -3, 1.02, 1.15))).toBe(true);
  });

  it('reads the Medieval look by candle light, with and without a picked accent', () => {
    obsidian('dark', LOOK_CLASS);
    expect(readLook(document)?.dark).toBe(true);
    expect(read()).toMatchObject({ '--background-primary': '#201b15', '--text-normal': '#ded2b8', '--text-accent': '#d4756b', '--interactive-normal': '#3a3125', '--menu-background': '#2b241c', '--color-accent': '#dd4646' });
    pickAccent(GREEN);
    const colours = read();
    expect(colours['--background-primary']).toBe('#201b15');
    expect(near(colours['--interactive-accent'], GREEN)).toBe(true);
    expect(near(colours['--text-accent'], derived(GREEN, -3, 1.02, 1.15))).toBe(true);
  });

  it('reads the Sci-fi look by day: its ink as the accent, or the picked one with Obsidian\'s light step', () => {
    obsidian('light', LOOK_CLASS, SCIFI_LOOK_CLASS);
    expect(read()).toMatchObject({ '--background-primary': '#f8f3e9', '--text-normal': '#16130f', '--interactive-accent': '#16130f', '--text-on-accent': '#f4eee1', '--atlas-theme-red': '#16130f' });
    pickAccent(ORANGE);
    const colours = read();
    expect(colours['--background-primary']).toBe('#f8f3e9');
    expect(near(colours['--interactive-accent'], derived(ORANGE, -1, 1.01, 1.075))).toBe(true);
    expect(near(colours['--text-accent'], ORANGE)).toBe(true);
  });

  it('reads the Sci-fi look at night: chalk as the accent with ink on it, or the picked orange', () => {
    obsidian('dark', LOOK_CLASS, SCIFI_LOOK_CLASS);
    expect(read()).toMatchObject({ '--background-primary': '#23201b', '--text-normal': '#e9decb', '--interactive-accent': '#e9decb', '--text-on-accent': '#12100d', '--menu-background': '#2d2923' });
    pickAccent(ORANGE);
    const colours = read();
    expect(colours['--background-primary']).toBe('#23201b');
    expect(near(colours['--interactive-accent'], ORANGE)).toBe(true);
    expect(near(colours['--interactive-accent-hover'], derived(ORANGE, -3, 1.02, 1.15))).toBe(true);
    expect(near(colours['--text-accent'], derived(ORANGE, -3, 1.02, 1.15))).toBe(true);
    expect(colours['--text-on-accent']).toBe('#f4eee1');
  });

  it('reads the GM\'s own theme, whose colours may change only under one scheme, in any colour form', () => {
    obsidian('dark');
    stylesheet('.theme-dark { --color-base-00: oklch(0 0 0); --text-faint: 12px; --color-green: lab(100 0 0); --background-modifier-border: rgb(10 20 30 / 50%); }');
    const look = readLook(document);
    expect(look?.dark).toBe(true);
    expect(look?.colours).toMatchObject({ '--background-primary': '#000000', '--color-green': '#ffffff', '--background-modifier-border': '#0a141e80', '--background-modifier-hover': '#ffffff11' });
    expect(near(look?.colours['--interactive-accent'], hslHex(258, 88, 66))).toBe(true);
    // A value that is no colour, and colours the theme never defines, stay out: the device keeps its own.
    expect(look?.colours['--text-faint']).toBeUndefined();
    expect(look?.colours['--atlas-theme-paper']).toBeUndefined();
    document.body.removeClass('theme-dark');
    document.body.addClass('theme-light');
    expect(readLook(document)?.colours).toMatchObject({ '--background-primary': '#ffffff', '--text-normal': '#222222' });
    expect(readLook(document)?.dark).toBe(false);
  });

  it('leaves nothing behind in the document', () => {
    obsidian('light', LOOK_CLASS);
    const before = document.body.childElementCount;
    readLook(document);
    expect(document.body.childElementCount).toBe(before);
  });
});
