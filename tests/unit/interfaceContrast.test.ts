import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import * as sass from 'sass';
import { colourOf, contrast, hex, over, type Rgba } from '../helpers/cssColour';

/**
 * WCAG 2.1 AA, 1.4.3: the text of Atlas' own interface reaches 4.5:1 on the grounds it stands on, in each look Atlas
 * ships (Medieval and Sci-fi, light and dark) and in the GM's own theme as Obsidian draws it by default. The colours are
 * worked out from their definitions: Obsidian's default theme, then `styles/looks/atlas-looks.css`, then what Atlas'
 * stylesheet sets on its own roots. A see-through ground (Transparency) is the map under it, which no
 * definition holds; the QA bench measures those on rendered pixels.
 */

const LOOKS = fileURLToPath(new URL('../../styles/looks/atlas-looks.css', import.meta.url));
const MAIN = fileURLToPath(new URL('../../styles/main.scss', import.meta.url));
/** A rule on the roots Atlas draws its interface in, where it may set inks of its own over the theme's: `body… X`. */
const ATLAS_ROOTS = / (?::is\([^)]*\.atlas-vtt-plugin\b[^)]*\)|\.atlas-vtt-plugin)$/;

type Mode = 'light' | 'dark';

/** Obsidian 1.15's default theme (read from Obsidian 1.15.1): its base scale and the variables it builds from it. */
const OBSIDIAN_BASE: Record<Mode, Record<string, string>> = {
  light: {
    '--color-base-00': '#ffffff', '--color-base-05': '#fcfcfc', '--color-base-10': '#fafafa', '--color-base-20': '#f6f6f6',
    '--color-base-25': '#efefef', '--color-base-30': '#e4e4e4', '--color-base-35': '#dadada', '--color-base-40': '#bdbdbd',
    '--color-base-50': '#ababab', '--color-base-60': '#707070', '--color-base-70': '#5c5c5c', '--color-base-100': '#222222',
    '--mono-100': 'black', '--color-red': '#e93147', '--color-accent': '#8a5cf5', '--text-accent': 'var(--color-accent)',
    '--background-secondary-alt': 'var(--color-base-05)',
    '--background-modifier-form-field': 'var(--color-base-00)', '--interactive-normal': 'var(--color-base-00)',
  },
  dark: {
    '--color-base-00': '#1c1c1c', '--color-base-05': '#212121', '--color-base-10': '#232323', '--color-base-20': '#282828',
    '--color-base-25': '#2e2e2e', '--color-base-30': '#333333', '--color-base-35': '#3f3f3f', '--color-base-40': '#555555',
    '--color-base-50': '#666666', '--color-base-60': '#999999', '--color-base-70': '#b3b3b3', '--color-base-100': '#dadada',
    '--mono-100': 'white', '--color-red': '#fb464c', '--color-accent': '#8a5cf5', '--text-accent': '#a68af9',
    '--background-secondary-alt': 'var(--color-base-30)',
    '--background-modifier-form-field': 'var(--color-base-25)', '--interactive-normal': 'var(--color-base-30)',
  },
};
const OBSIDIAN_BODY: Record<string, string> = {
  '--text-normal': 'var(--color-base-100)',
  '--text-muted': 'var(--color-base-70)',
  '--text-faint': 'var(--color-base-50)',
  '--background-primary': 'var(--color-base-00)',
  '--background-primary-alt': 'var(--color-base-10)',
  '--background-secondary': 'var(--color-base-20)',
  '--background-modifier-hover': 'color-mix(in oklch, var(--mono-100) 6.7%, transparent)',
  '--text-error': 'var(--color-red)',
  '--table-header-background': 'transparent',
  '--table-header-color': 'var(--text-normal)',
};

const SCHEMES: Record<string, { mode: Mode; classes: string[] }> = {
  'your own theme, light': { mode: 'light', classes: ['theme-light'] },
  'your own theme, dark': { mode: 'dark', classes: ['theme-dark'] },
  'Medieval, light': { mode: 'light', classes: ['theme-light', 'atlas-look'] },
  'Medieval, dark': { mode: 'dark', classes: ['theme-dark', 'atlas-look'] },
  'Sci-fi, light': { mode: 'light', classes: ['theme-light', 'atlas-look', 'atlas-look-scifi'] },
  'Sci-fi, dark': { mode: 'dark', classes: ['theme-dark', 'atlas-look', 'atlas-look-scifi'] },
};

/** A selector's `body` compound: the classes it needs and those it must not have, or null for any other selector. */
function bodyCompound(selector: string): { needs: string[]; refuses: string[] } | null {
  const classes = /^body((?:\.[\w-]+|:not\(\.[\w-]+\))*)$/.exec(selector.trim())?.[1];
  if (classes === undefined) return null;
  return {
    needs: [...classes.matchAll(/(?<!:not\()\.([\w-]+)/g)].map(([, name = '']) => name),
    refuses: [...classes.matchAll(/:not\(\.([\w-]+)\)/g)].map(([, name = '']) => name),
  };
}

/** The custom properties `css` sets on a body with `classes` (or on what `under` names inside it), by the cascade. */
function bodyVariables(css: string, classes: string[], under?: RegExp): [string, string][] {
  const found: { specificity: number; order: number; decls: [string, string][] }[] = [];
  postcss.parse(css).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const inside = under ? under.exec(selector) : null;
      if (under && !inside) continue;
      const compound = bodyCompound(inside ? selector.slice(0, inside.index) : selector);
      if (!compound || !compound.needs.every((c) => classes.includes(c)) || compound.refuses.some((c) => classes.includes(c))) continue;
      const decls: [string, string][] = [];
      rule.walkDecls(/^--/, (decl) => { decls.push([decl.prop, decl.value]); });
      found.push({ specificity: compound.needs.length + compound.refuses.length, order: found.length, decls });
    }
  });
  return found.sort((a, b) => a.specificity - b.specificity || a.order - b.order).flatMap((rule) => rule.decls);
}

const looksCss = fs.readFileSync(LOOKS, 'utf8');
const rootCss = sass.compile(MAIN, { logger: sass.Logger.silent }).css;

function variables(scheme: { mode: Mode; classes: string[] }): Map<string, string> {
  const vars = new Map<string, string>([...Object.entries(OBSIDIAN_BASE[scheme.mode]), ...Object.entries(OBSIDIAN_BODY)]);
  for (const [prop, value] of bodyVariables(looksCss, scheme.classes)) vars.set(prop, value);
  // Atlas' roots redefine some of them from the body's values, so those are resolved against the body first.
  const body = new Map(vars);
  for (const [prop, value] of bodyVariables(rootCss, scheme.classes, ATLAS_ROOTS)) vars.set(prop, hex(colourOf(value, body)));
  return vars;
}

const NORMAL = '--text-normal';
const MUTED = '--text-muted';
const FAINT = '--text-faint';
const ERROR = '--text-error';
const LINK = '--text-accent';

/** The grounds Atlas sets text on, and the inks it sets on each: the pairs the QA bench's contrast scan found. */
const GROUNDS: { name: string; ground: (c: (v: string) => Rgba) => Rgba; inks: string[] }[] = [
  { name: 'the page', ground: (c) => c('var(--background-primary)'), inks: [NORMAL, MUTED, FAINT, ERROR, LINK] },
  { name: 'a sidebar or menu', ground: (c) => c('var(--background-secondary)'), inks: [NORMAL, MUTED, FAINT] },
  { name: 'a field', ground: (c) => over(c('var(--background-modifier-form-field)'), c('var(--background-primary)')), inks: [NORMAL, FAINT] },
  { name: 'a field on a sidebar', ground: (c) => over(c('var(--background-modifier-form-field)'), c('var(--background-secondary)')), inks: [NORMAL, FAINT] },
  { name: 'a hovered row', ground: (c) => over(c('var(--background-modifier-hover)'), c('var(--background-primary)')), inks: [NORMAL, MUTED, FAINT] },
  { name: 'a button', ground: (c) => over(c('var(--interactive-normal)'), c('var(--background-primary)')), inks: [NORMAL, MUTED] },
  { name: 'a table head', ground: (c) => over(c('var(--table-header-background)'), c('var(--background-primary)')), inks: ['--table-header-color'] },
];

/** How far apart the muted and the faint ink stand (their own contrast), so the quieter tiers still read as two. */
const TIER_STEP = 1.2;

function shortfalls(scheme: { mode: Mode; classes: string[] }): string[] {
  const vars = variables(scheme);
  const c = (value: string): Rgba => colourOf(value, vars);
  return GROUNDS.flatMap(({ name, ground, inks }) => {
    const g = ground(c);
    return inks.map((ink) => ({ ink, name, ratio: contrast(over(c(`var(${ink})`), g), g) }))
      .filter((pair) => pair.ratio < 4.5)
      .map((pair) => `${pair.ink} on ${pair.name}: ${pair.ratio.toFixed(2)}:1`);
  });
}

/** The muted ink stands further from the page than the faint one, by `TIER_STEP` at least. */
function tierStep(scheme: { mode: Mode; classes: string[] }): { further: boolean; step: number } {
  const vars = variables(scheme);
  const c = (value: string): Rgba => colourOf(value, vars);
  const page = c('var(--background-primary)');
  const [muted, faint] = [over(c(`var(${MUTED})`), page), over(c(`var(${FAINT})`), page)];
  return { further: contrast(muted, page) > contrast(faint, page), step: Number(contrast(muted, faint).toFixed(2)) };
}

describe("contrast of Atlas' text (WCAG 2.1 AA, 4.5:1)", () => {
  for (const [name, scheme] of Object.entries(SCHEMES)) {
    it(`reaches 4.5:1 in ${name}`, () => {
      expect(shortfalls(scheme)).toEqual([]);
    });
    it(`keeps the muted ink a step heavier than the faint one in ${name}`, () => {
      const { further, step } = tierStep(scheme);
      expect(further).toBe(true);
      expect(step).toBeGreaterThanOrEqual(TIER_STEP);
    });
  }
});
