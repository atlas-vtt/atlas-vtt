/**
 * Atlas VTT Design Tokens (TypeScript)
 *
 * Mirrors styles/_tokens.scss for use in PIXI components and JavaScript.
 * Keep these values in sync with the SCSS tokens.
 */

// ── Spacing (8px base) ───────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  '2xl': 32,
} as const;

// ── Border Radius ────────────────────────────────────────────────────────────
export const radius = {
  xs: 2,
  s: 4,
  m: 6,
  l: 8,
  xl: 12,
  '2xl': 16,
  full: 9999,
} as const;

// ── Border Width ─────────────────────────────────────────────────────────────
export const borderWidth = {
  s: 1,
  m: 1.5,
  l: 2,
} as const;

// ── Border Opacity ───────────────────────────────────────────────────────────
export const borderOpacity = {
  subtle: 0.1,
  default: 0.18,
  strong: 0.3,
} as const;

// ── Z-Index Layers ───────────────────────────────────────────────────────────
export const zIndex = {
  base: 1,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  popover: 500,
  tooltip: 600,
  notification: 700,
  // Legacy high values for Obsidian compatibility
  atlasDropdown: 9999,
  atlasModal: 10000,
} as const;

// ── Transitions (in milliseconds) ────────────────────────────────────────────
export const transition = {
  fast: 100,
  normal: 200,
  slow: 300,
} as const;

// ── Icon Sizes ───────────────────────────────────────────────────────────────
export const iconSize = {
  xs: 12,
  s: 16,
  m: 20,
  l: 24,
  xl: 32,
} as const;

// ── Component Sizes ──────────────────────────────────────────────────────────
export const buttonHeight = {
  s: 24,
  m: 32,
  l: 40,
} as const;

export const inputHeight = {
  s: 28,
  m: 36,
  l: 44,
} as const;

// ── Pin/Badge Sizes ──────────────────────────────────────────────────────────
export const pinSize = {
  badgeRadius: 20,
  iconSize: 22,
} as const;

// ── Token Ring 3D Effect ─────────────────────────────────────────────────────
// Configuration for creating metallic/beveled token ring appearance


// ── Colors (hex values for PIXI) ─────────────────────────────────────────────
// These are commonly used colors that don't come from Obsidian CSS variables
export const colors = {
  // Health bar colors
  health: {
    healthy: 0x22c55e,    // Green - >= 70%
    injured: 0xeab308,    // Yellow - 30-69%
    critical: 0xef4444,   // Red - < 30%
    background: 0x1a1a1a,
  },
  // Status colors
  status: {
    success: 0x10b981,    // Emerald
    warning: 0xf59e0b,    // Amber
    error: 0xef4444,      // Red
    info: 0x3b82f6,       // Blue
  },
  // UI colors
  ui: {
    accent: 0x7c3aed,     // Purple accent
    border: {
      light: 0x404040,
      dark: 0x404040,
    },
    background: {
      light: 0xffffff,
      dark: 0x1e1e1e,
    },
  },
} as const;

// ── Bar Dimensions ───────────────────────────────────────────────────────────
export const barDimensions = {
  // Health/Stress bars on tokens
  token: {
    width: 64,
    height: 10,
    gap: 2,
    radius: 5,  // Half of height for pill shape
    offsetY: 8,  // Distance below token
    borderWidth: 1.5,
    innerPadding: 2,  // Padding between border and fill
  },
  // Initiative tracker bars
  initiative: {
    height: 4,
    radius: 2,
  },
} as const;;

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Convert hex string to number for PIXI
 */
export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/**
 * Get RGBA alpha from border opacity token
 */
export function getBorderAlpha(opacity: keyof typeof borderOpacity): number {
  return borderOpacity[opacity];
}

// ── Color Manipulation Helpers ───────────────────────────────────────────────

/**
 * Lighten a hex color by a percentage (for highlights)
 * @param color - Hex color as number (0xRRGGBB)
 * @param amount - Amount to lighten (0-1)
 */
export function lightenColor(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
  return (r << 16) | (g << 8) | b;
}

/**
 * Darken a hex color by a percentage (for shadows)
 * @param color - Hex color as number (0xRRGGBB)
 * @param amount - Amount to darken (0-1)
 */
export function darkenColor(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((color >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (color & 0xff) - Math.round(255 * amount));
  return (r << 16) | (g << 8) | b;
}

/**
 * Mix two hex colours channel by channel
 * @param from - Hex color as number (0xRRGGBB)
 * @param to - Hex color as number (0xRRGGBB)
 * @param share - Share of `to` in the result (0-1)
 */
export function mixColor(from: number, to: number, share: number): number {
  const channel = (shift: number): number => Math.round(((from >> shift) & 0xff) * (1 - share) + ((to >> shift) & 0xff) * share);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Get 3D ring colors from a base color
 * Returns highlight, shadow, and specular colors for beveled effect
 */

