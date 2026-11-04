/** Obsidian's default theme variables (light and dark) the dashboard's browser tests lay it out over, and the view's size. */
export const DASHBOARD_THEME = `
  .theme-light { color-scheme: light; --mono-100: black; --color-base-00: #ffffff; --color-base-05: #fcfcfc; --color-base-10: #fafafa; --color-base-20: #f6f6f6; --color-base-25: #efefef;
    --color-base-30: #e4e4e4; --color-base-35: #dadada; --color-base-40: #bdbdbd; --color-base-50: #ababab; --color-base-60: #707070; --color-base-70: #5c5c5c; --color-base-100: #222222;
    --color-red: #e93147; --background-modifier-form-field: var(--color-base-00); --interactive-accent: hsl(258, 88%, 66%); --text-accent: hsl(258, 88%, 66%);
    --shadow-s: 0px 1px 2px rgba(0, 0, 0, 0.028), 0px 3.4px 6.7px rgba(0, 0, 0, 0.042), 0px 15px 30px rgba(0, 0, 0, 0.07); }
  .theme-dark { color-scheme: dark; --mono-100: white; --color-base-00: #1c1c1c; --color-base-05: #212121; --color-base-10: #232323; --color-base-20: #282828; --color-base-25: #2e2e2e;
    --color-base-30: #333333; --color-base-35: #3f3f3f; --color-base-40: #555555; --color-base-50: #666666; --color-base-60: #999999; --color-base-70: #b3b3b3; --color-base-100: #dadada;
    --color-red: #fb464c; --background-modifier-form-field: var(--color-base-25); --interactive-accent: hsl(258, 88%, 66%); --text-accent: hsl(255, 89.8%, 75.9%);
    --shadow-s: 0px 1px 2px rgba(0, 0, 0, 0.121), 0px 3.4px 6.7px rgba(0, 0, 0, 0.179), 0px 15px 30px rgba(0, 0, 0, 0.3); }
  body { margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-interface: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --background-primary: var(--color-base-00); --background-secondary: var(--color-base-20); --background-modifier-hover: color-mix(in oklch, var(--mono-100) 6.7%, transparent);
    --background-modifier-active-hover: color-mix(in oklch, var(--interactive-accent) 10%, transparent); --background-modifier-border: var(--color-base-30);
    --background-modifier-border-hover: var(--color-base-35); --background-modifier-border-focus: var(--color-base-40); --background-modifier-error: var(--color-red);
    --text-normal: var(--color-base-100); --text-muted: var(--color-base-70); --text-faint: var(--color-base-50); --text-on-accent: white; --text-error: var(--color-red);
    --interactive-accent-hover: var(--interactive-accent); --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px;
    --font-normal: 400; --font-medium: 500; --font-semibold: 600; --h1-size: 1.618em; --h1-weight: 700; --h1-line-height: 1.2; --input-height: 30px;
    --line-height-normal: 1.5; --line-height-tight: 1.3; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px; --corner-shape: round;
    --menu-background: var(--background-secondary); --menu-border-color: var(--background-modifier-border-hover); --menu-border-width: 1px; --menu-shadow: var(--shadow-s);
    --scrollbar-thumb-bg: color-mix(in oklch, var(--mono-100) 10%, transparent); background: var(--background-primary); color: var(--text-normal); }
  button, input, textarea { font: inherit; font-size: 13px; }
  button { height: 30px; border: none; background: var(--color-base-30); color: var(--text-normal); border-radius: 8px; }
  .atlas-dashboard-view { width: 1280px; height: 860px; overflow: auto; }
`;
