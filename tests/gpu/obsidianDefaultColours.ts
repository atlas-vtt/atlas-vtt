/**
 * Obsidian's default theme as far as its colours go: the base scale and the accent per scheme, and every surface,
 * text and control colour taken from them as Obsidian takes them (`var()` chains, `hsl()` of the accent, mixes in
 * oklch). The looks stylesheet re-tints the scale and the accent over it, as in Obsidian.
 */
export const OBSIDIAN_DEFAULT_COLOURS = `
  body {
    --accent-h: 258; --accent-s: 88%; --accent-l: 66%;
    --color-accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
    --background-primary: var(--color-base-00); --background-primary-alt: var(--color-base-10); --background-secondary: var(--color-base-20);
    --background-modifier-hover: color-mix(in oklch, var(--mono-100) 6.7%, transparent);
    --background-modifier-active-hover: color-mix(in oklch, var(--interactive-accent) 10%, transparent);
    --background-modifier-border: var(--color-base-30); --background-modifier-border-hover: var(--color-base-35); --background-modifier-border-focus: var(--color-base-40);
    --background-modifier-error: var(--color-red); --background-modifier-form-field: var(--color-base-00);
    --text-normal: var(--color-base-100); --text-muted: var(--color-base-70); --text-faint: var(--color-base-50); --text-on-accent: white;
    --text-error: var(--color-red); --text-accent: var(--color-accent); --text-accent-hover: var(--color-accent-2);
    --interactive-normal: var(--color-base-00); --interactive-hover: var(--color-base-10);
    --interactive-accent: var(--color-accent-1); --interactive-accent-hover: var(--color-accent-2);
    --menu-background: var(--background-secondary);
  }
  .theme-light {
    --mono-0: white; --mono-100: black; --color-red: #e93147;
    --color-base-00: #ffffff; --color-base-10: #fafafa; --color-base-20: #f6f6f6; --color-base-25: #efefef; --color-base-30: #e4e4e4;
    --color-base-35: #dadada; --color-base-40: #bdbdbd; --color-base-50: #ababab; --color-base-70: #5c5c5c; --color-base-100: #222222;
    --color-accent-1: hsl(calc(var(--accent-h) - 1), calc(var(--accent-s) * 1.01), calc(var(--accent-l) * 1.075));
    --color-accent-2: hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.15));
  }
  .theme-dark {
    --mono-0: black; --mono-100: white; --color-red: #fb464c;
    --color-base-00: #1e1e1e; --color-base-10: #242424; --color-base-20: #262626; --color-base-25: #2a2a2a; --color-base-30: #363636;
    --color-base-35: #3f3f3f; --color-base-40: #555555; --color-base-50: #666666; --color-base-70: #b3b3b3; --color-base-100: #dadada;
    --color-accent-1: hsl(calc(var(--accent-h) - 3), calc(var(--accent-s) * 1.02), calc(var(--accent-l) * 1.15));
    --color-accent-2: hsl(calc(var(--accent-h) - 5), calc(var(--accent-s) * 1.05), calc(var(--accent-l) * 1.29));
    --background-modifier-form-field: var(--color-base-25);
    --interactive-normal: var(--color-base-30); --interactive-hover: var(--color-base-35);
    --interactive-accent: var(--color-accent); --interactive-accent-hover: var(--color-accent-1); --text-accent: var(--color-accent-1);
  }
`;
