import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { canvasBadgeColors, isDarkTheme } from '../utils/canvasBadgeColors';
import { spacing } from '../../styles/designTokens';
import { uiCorner } from '../utils/squareCorners';

const FONT_SIZE = 13;
const FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export interface HexLinkChipContent {
  /** The hex's number, when the hex has one. */
  number?: string | undefined;
  /** The linked note's name. */
  title?: string | undefined;
}

/**
 * A capsule naming a hex ("0304 · Blackwater Keep"), drawn at screen size and
 * anchored at its bottom centre so it sits above the hex. Null when there is
 * nothing to show.
 */
export function createHexLinkChip({ number, title }: HexLinkChipContent): Container | null {
  if (!number && !title) return null;

  const colors = canvasBadgeColors();
  const chip = new Container({ label: 'hex-link-chip', eventMode: 'none' });
  const parts: Text[] = [];
  if (number) parts.push(chipText(number, colors.stroke, 'bold'));
  if (title) parts.push(chipText(title, colors.stroke, 'normal'));

  const contentWidth = parts.reduce((sum, part) => sum + part.width, 0) + spacing.s * (parts.length - 1);
  const contentHeight = Math.max(...parts.map((part) => part.height));
  const width = contentWidth + 2 * spacing.s;
  const height = contentHeight + 2 * spacing.s;

  const background = new Graphics()
    .roundRect(-width / 2, -height, width, height, uiCorner(height / 2))
    .fill({ color: colors.background, alpha: 0.95 })
    .stroke({ width: 0.5, color: colors.stroke, alpha: isDarkTheme() ? 0.4 : 0.3 });
  chip.addChild(background);

  let x = -width / 2 + spacing.s;
  for (const part of parts) {
    part.position.set(x, -height + spacing.s + (contentHeight - part.height) / 2);
    x += part.width + spacing.s;
    chip.addChild(part);
  }
  return chip;
}

function chipText(text: string, color: number, fontWeight: 'bold' | 'normal'): Text {
  return new Text({
    text,
    style: new TextStyle({ fill: color, fontSize: FONT_SIZE, fontFamily: FONT_FAMILY, fontWeight }),
    resolution: Math.max(2, activeWindow.devicePixelRatio || 1),
  });
}
