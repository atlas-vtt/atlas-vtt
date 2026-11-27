import { isRecord } from './shape.ts';

/**
 * The colours of the GM's Obsidian a GM screen device draws with: Obsidian's colour variables and the Atlas VTT
 * theme's that the device's page has a stand-in of its own for. Nothing else of a theme travels: no fonts, sizes,
 * corners or shadows, which a device may not have or show alike.
 */
export const LOOK_COLOURS = [
  '--color-accent', '--color-accent-1', '--color-accent-2',
  '--background-primary', '--background-primary-alt', '--background-secondary', '--background-secondary-alt',
  '--background-modifier-hover', '--background-modifier-active-hover', '--background-modifier-selected',
  '--background-modifier-border', '--background-modifier-border-hover', '--background-modifier-border-focus',
  '--background-modifier-error', '--background-modifier-error-hover', '--background-modifier-form-field', '--background-modifier-cover',
  '--text-normal', '--text-muted', '--text-faint', '--text-on-accent', '--text-error', '--text-warning', '--text-success',
  '--text-selection', '--text-accent', '--text-accent-hover', '--link-color',
  '--interactive-normal', '--interactive-hover', '--interactive-accent', '--interactive-accent-hover',
  '--divider-color', '--scrollbar-thumb-bg', '--scrollbar-active-thumb-bg', '--nav-item-background-hover',
  '--checkbox-color', '--checkbox-border-color', '--menu-background', '--menu-border-color',
  '--table-header-background', '--table-header-color',
  '--mono-0', '--mono-100',
  '--color-red', '--color-orange', '--color-yellow', '--color-green', '--color-cyan', '--color-blue', '--color-purple', '--color-pink',
  '--color-base-00', '--color-base-05', '--color-base-10', '--color-base-20', '--color-base-25', '--color-base-30',
  '--color-base-35', '--color-base-40', '--color-base-50', '--color-base-60', '--color-base-70', '--color-base-100',
  '--atlas-theme-paper', '--atlas-theme-red', '--atlas-theme-rule',
] as const;

export type LookColour = (typeof LOOK_COLOURS)[number];

/** A colour as it travels: `#rrggbb`, or `#rrggbbaa` where it is not opaque, in lower case and nothing else. */
export const LOOK_COLOUR_VALUE = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/;

/**
 * From Atlas to a device: whether the GM's Obsidian is dark, and the colours of `LOOK_COLOURS` it shows, each
 * resolved to one plain colour. A colour Obsidian does not define is left out, and the device keeps its own.
 */
export interface LookMessage {
  readonly t: 'look';
  readonly dark: boolean;
  readonly colours: Readonly<Partial<Record<LookColour, string>>>;
}

/**
 * A look as a device reads it: only the colours of the list, each only in the written form; null where none holds
 * or the shape is wrong, so a device keeps the look it shows.
 */
export function parseLookMessage(value: Record<string, unknown>): LookMessage | null {
  const { dark, colours: given } = value;
  if (value.t !== 'look' || typeof dark !== 'boolean' || !isRecord(given)) return null;
  const colours: Partial<Record<LookColour, string>> = {};
  for (const name of LOOK_COLOURS) {
    const colour = Object.hasOwn(given, name) ? given[name] : undefined;
    if (typeof colour === 'string' && LOOK_COLOUR_VALUE.test(colour)) colours[name] = colour;
  }
  return Object.keys(colours).length === 0 ? null : { t: 'look', dark, colours };
}
