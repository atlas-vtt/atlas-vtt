/**
 * Obsidian's default theme as far as its colours go: the base scale, the named colours and the accent per scheme,
 * and every surface, text and control colour taken from them as Obsidian takes them (`var()` chains, `rgba()` of
 * the mono channels, `hsl()` and `hsla()` of the accent). The looks stylesheet re-tints the scale and the accent
 * over it, as in Obsidian.
 */
export const OBSIDIAN_DEFAULT_COLOURS = `
  body {
    --accent-h: 258; --accent-s: 88%; --accent-l: 66%;
    --color-accent-hsl: var(--accent-h), var(--accent-s), var(--accent-l);
    --color-accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
    --background-primary: var(--color-base-00); --background-primary-alt: var(--color-base-10);
    --background-secondary: var(--color-base-20); --background-secondary-alt: var(--color-base-05);
    --background-modifier-hover: rgba(var(--mono-rgb-100), 0.067);
    --background-modifier-active-hover: hsla(var(--color-accent-hsl), 0.15);
    --background-modifier-border: var(--color-base-30); --background-modifier-border-hover: var(--color-base-35); --background-modifier-border-focus: var(--color-base-40);
    --background-modifier-error: var(--color-red); --background-modifier-error-hover: var(--color-red);
    --background-modifier-form-field: var(--color-base-00); --background-modifier-cover: rgba(220, 220, 220, 0.4);
    --text-normal: var(--color-base-100); --text-muted: var(--color-base-70); --text-faint: var(--color-base-50);
    --text-on-accent: white; --text-error: var(--color-red); --text-warning: var(--color-orange); --text-success: var(--color-green);
    --text-selection: hsla(var(--color-accent-hsl), 0.2);
    --text-accent: var(--color-accent); --text-accent-hover: var(--color-accent-2); --link-color: var(--text-accent);
    --interactive-normal: var(--color-base-00); --interactive-hover: var(--color-base-10);
    --interactive-accent: var(--color-accent-1); --interactive-accent-hover: var(--color-accent-2);
    --divider-color: var(--background-modifier-border);
    --scrollbar-thumb-bg: rgba(var(--mono-rgb-100), 0.1); --scrollbar-active-thumb-bg: rgba(var(--mono-rgb-100), 0.2);
    --nav-item-background-hover: var(--background-modifier-hover);
    --checkbox-color: var(--interactive-accent); --checkbox-border-color: var(--text-faint);
    --menu-background: var(--background-secondary); --menu-border-color: var(--background-modifier-border-hover);
    --table-background: transparent; --table-header-background: var(--table-background); --table-header-color: var(--text-normal);
  }
  .theme-light {
    --mono-rgb-0: 255, 255, 255; --mono-rgb-100: 0, 0, 0; --mono-0: white; --mono-100: black;
    --color-red: #e93147; --color-orange: #ec7500; --color-yellow: #e0ac00; --color-green: #08b94e;
    --color-cyan: #00bfbc; --color-blue: #086ddd; --color-purple: #7852ee; --color-pink: #d53984;
    --color-base-00: #ffffff; --color-base-05: #fcfcfc; --color-base-10: #fafafa; --color-base-20: #f6f6f6; --color-base-25: #e3e3e3; --color-base-30: #e0e0e0;
    --color-base-35: #d4d4d4; --color-base-40: #bdbdbd; --color-base-50: #ababab; --color-base-60: #707070; --color-base-70: #5a5a5a; --color-base-100: #222222;
    --color-accent-1: hsl(calc(var(--accent-h) - 1), calc(var(--accent-s) * 1.01), calc(var(--accent-l) * 1.075));
    --color-accent-2: hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.15));
  }
  .theme-dark {
    --mono-rgb-0: 0, 0, 0; --mono-rgb-100: 255, 255, 255; --mono-0: black; --mono-100: white;
    --color-red: #fb464c; --color-orange: #e9973f; --color-yellow: #e0de71; --color-green: #44cf6e;
    --color-cyan: #53dfdd; --color-blue: #027aff; --color-purple: #a882ff; --color-pink: #fa99cd;
    --color-base-00: #1e1e1e; --color-base-05: #212121; --color-base-10: #242424; --color-base-20: #262626; --color-base-25: #2a2a2a; --color-base-30: #363636;
    --color-base-35: #3f3f3f; --color-base-40: #555555; --color-base-50: #666666; --color-base-60: #999999; --color-base-70: #b3b3b3; --color-base-100: #dadada;
    --color-accent-1: hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.15));
    --color-accent-2: hsl(calc(var(--accent-h) - 5), calc(var(--accent-s) * 1.05), calc(var(--accent-l) * 1.29));
    --background-secondary-alt: var(--color-base-30); --background-modifier-form-field: var(--color-base-25);
    --background-modifier-cover: rgba(10, 10, 10, 0.4); --text-selection: hsla(var(--color-accent-hsl), 0.25);
    --interactive-normal: var(--color-base-30); --interactive-hover: var(--color-base-35);
    --interactive-accent: var(--color-accent); --interactive-accent-hover: var(--color-accent-1); --text-accent: var(--color-accent-1);
  }
`;
