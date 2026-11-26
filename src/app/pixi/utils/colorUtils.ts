import { getDomHost } from '../../host/dom';
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return [R, G, B];
}

/** A colour number as '#rrggbb'. */
export function hexColorOf(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function cssColorToHexNumber(color: string): number {
  const FALLBACK = 0x00ffff; // bright cyan
  if (!color) return FALLBACK;
  color = color.trim();
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6); // Ignore alpha
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
      const n = Number.parseInt(hex, 16);
      if (!Number.isNaN(n)) return n;
    }
  }
  if (color.startsWith('rgb')) {
    const nums = color.match(/\d+/g)?.map(Number);
    if (nums && nums.length >= 3 && nums.slice(0,3).every(n => !Number.isNaN(n))) {
      const [r, g, b] = nums as [number, number, number];
      return (r << 16) + (g << 8) + b;
    }
  }
  if (color.startsWith('hsl')) {
    const nums = color.match(/[-\d.]+/g)?.map(Number);
    if (nums && nums.length >= 3 && nums.slice(0,3).every(n => !Number.isNaN(n))) {
      const [h, s, l] = nums as [number, number, number];
      const [r, g, b] = hslToRgb(h, s, l);
      return (r << 16) + (g << 8) + b;
    }
  }
  return FALLBACK;
}

export function resolveCssColor(cssColor: string): string {
  if (typeof window === 'undefined') return '#00ffff'; // Fallback for non-browser env
  const probe = getDomHost().createDiv(getDomHost().activeDocument().body, 'atlas-color-probe');
  probe.style.color = cssColor;
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || '#00ffff'; // Fallback if resolution fails
}

/** Theme colours as last resolved, by their variable: the value each was resolved from and the body's class and style it was read under. */
const resolvedThemeColors = new Map<string, { raw: string; color: string; body: string }>();

/** Makes the next `getObsidianAccentColor` and `getObsidianErrorColor` resolve their colour anew (`registerAccentColorSync`). */
export function forgetObsidianAccentColor(): void {
  resolvedThemeColors.clear();
}

/**
 * The colour the theme's `variable` names, `fallback` where it names none. Read again only when the
 * body's class or inline style changed (a theme switch, an accent Obsidian sets) or Obsidian's CSS
 * did (`forgetObsidianAccentColor`): reading a computed style while the document is being changed
 * makes Chromium restyle it first. Resolved once per value of the variable: resolving puts an
 * element into the body, and an insertion there can make Chromium restyle the whole document.
 */
function themeColor(variable: string, fallback: string): string {
  const { body } = getDomHost().activeDocument();
  const read = `${body.className}|${body.getAttribute('style') ?? ''}`;
  const known = resolvedThemeColors.get(variable);
  if (known?.body === read) return known.color;
  const raw = (getComputedStyle(body).getPropertyValue(variable) || '').trim();
  const color = !raw ? fallback : known?.raw === raw ? known.color : resolveCssColor(raw);
  resolvedThemeColors.set(variable, { raw, color, body: read });
  return color;
}

/** Obsidian's accent colour. Drags and measurements ask for it on every pointer move (`themeColor`). */
export function getObsidianAccentColor(): string {
  if (typeof window === 'undefined') return '#00ffff';
  try {
    return themeColor('--interactive-accent', '#00ffff');
  } catch (error) {
    console.warn("[ColorUtils] Error getting Obsidian accent color:", error);
    return '#00ffff';
  }
}

/** Obsidian's red where the theme names none. */
const FALLBACK_ERROR = '#e93147';

/** The theme's warning red (`--text-error`): what a drag past a token's speed is drawn in, asked for on every pointer move of it. */
export function getObsidianErrorColor(): string {
  return typeof window === 'undefined' ? FALLBACK_ERROR : themeColor('--text-error', FALLBACK_ERROR);
}
