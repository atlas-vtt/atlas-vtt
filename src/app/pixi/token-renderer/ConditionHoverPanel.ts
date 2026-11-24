import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { MOTION_FAST_MS } from '../../utils/motion';
import { cssColorToHexNumber, resolveCssColor } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { createConditionBadge } from './ConditionBadge';
import type { ActiveCondition } from './ConditionBadgeRing';
import { uiCorner } from '../utils/squareCorners';

/** Card metrics in screen pixels, matching Atlas tooltips (`atlas-elevated-surface`). */
const PADDING = 8;
const GAP = 8;
const CORNER_RADIUS = 12;
const BORDER_WIDTH = 1.5;
const BORDER_ALPHA = 0.18;
const BADGE_RADIUS = 8;
const FONT_SIZE = 13;
const FALLBACK_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
/** Distance between the token's ring and the card. */
const OFFSET = 8;
/** The card slides this far out of the token while it fades in. */
const ENTRANCE_SLIDE = 4;
const ENTRANCE_SCALE = 0.97;

/**
 * Card beside a hovered token that names its conditions, one row per condition with the
 * same badge as on the token. It keeps a constant size on screen, like a tooltip, and
 * takes Obsidian's theme colours and interface font.
 */
export class ConditionHoverPanel {
  readonly container = new Container({ eventMode: 'none', interactiveChildren: false, visible: false });
  private content: Container | null = null;
  private signature = '';
  private height = 0;
  private anchorX = 0;
  private screenScale = 1;
  private reveal = new ValueTransition(0, MOTION_FAST_MS, () => this.applyReveal());

  /** Places the card `ringRadius` world units right of the token centre, `screenScale` world units per pixel. */
  place(ringRadius: number, screenScale: number): void {
    this.anchorX = ringRadius;
    this.screenScale = screenScale;
    this.applyReveal();
  }

  show(conditions: ActiveCondition[], animate: boolean): void {
    if (conditions.length === 0) {
      this.hide(false);
      return;
    }
    const signature = JSON.stringify(conditions);
    const isOpening = !this.container.visible || this.reveal.targetValue !== 1;
    // Rebuilt on every opening, so it picks up theme changes
    if (isOpening || signature !== this.signature) this.build(conditions, signature);
    if (!isOpening) return;
    this.container.visible = true;
    if (animate) this.reveal.animateTo(1);
    else this.reveal.jumpTo(1);
  }

  hide(animate: boolean): void {
    if (!this.container.visible) return;
    const finish = (): void => {
      this.container.visible = false;
    };
    if (animate) {
      this.reveal.animateTo(0, finish);
    } else {
      this.reveal.jumpTo(0);
      finish();
    }
  }

  destroy(): void {
    this.reveal.cancel();
    this.content = null;
    destroyTree(this.container);
  }

  private build(conditions: ActiveCondition[], signature: string): void {
    if (this.content) destroyTree(this.content);
    this.signature = signature;

    const theme = readTheme();
    const style = new TextStyle({ fontFamily: theme.font, fontSize: FONT_SIZE, fontWeight: '500', fill: theme.text });
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    const labels = conditions.map((condition) => new Text({ text: condition.name, style, resolution }));

    const rowHeight = Math.max(BADGE_RADIUS * 2, ...labels.map((label) => label.height));
    const textWidth = Math.max(...labels.map((label) => label.width));
    const width = PADDING + BADGE_RADIUS * 2 + GAP + textWidth + PADDING;
    this.height = PADDING * 2 + rowHeight * conditions.length + GAP * (conditions.length - 1);

    const content = new Container({ eventMode: 'none', interactiveChildren: false });
    content.addChild(drawCard(width, this.height, theme));
    conditions.forEach((condition, index) => {
      const rowY = PADDING + index * (rowHeight + GAP);
      // The label already reads "Frightened 2", so the card's badge leaves out the number
      const badge = createConditionBadge({ color: condition.color, glyph: condition.glyph }, BADGE_RADIUS);
      badge.position.set(PADDING + BADGE_RADIUS, rowY + rowHeight / 2);
      const label = labels[index];
      if (label) label.position.set(PADDING + BADGE_RADIUS * 2 + GAP, rowY + (rowHeight - label.height) / 2);
      content.addChild(badge, ...(label ? [label] : []));
    });

    this.content = content;
    this.container.addChild(content);
    this.applyReveal();
  }

  /** Fades the card in while it slides out of the token and settles to full size. */
  private applyReveal(): void {
    const progress = this.reveal.value;
    const scale = this.screenScale * (ENTRANCE_SCALE + (1 - ENTRANCE_SCALE) * progress);
    const slide = (1 - progress) * -ENTRANCE_SLIDE;
    this.container.alpha = progress;
    this.container.scale.set(scale);
    this.container.position.set(this.anchorX + (OFFSET + slide) * this.screenScale, (-this.height / 2) * scale);
  }
}

interface CardTheme {
  background: number;
  text: number;
  font: string;
}

function readTheme(): CardTheme {
  const font = getComputedStyle(document.body).getPropertyValue('--font-interface').trim();
  return {
    background: cssColorToHexNumber(resolveCssColor('var(--background-primary)')),
    text: cssColorToHexNumber(resolveCssColor('var(--text-normal)')),
    font: font || FALLBACK_FONT,
  };
}

/** The elevated surface: soft shadow, theme background and a faint border in the text colour. */
function drawCard(width: number, height: number, theme: CardTheme): Graphics {
  const card = new Graphics();
  for (let layer = 3; layer >= 1; layer--) {
    const spread = layer * 2;
    card
      .roundRect(-spread, -spread + 3, width + spread * 2, height + spread * 2, uiCorner(CORNER_RADIUS + spread))
      .fill({ color: 0x000000, alpha: 0.05 });
  }
  return card
    .roundRect(0, 0, width, height, uiCorner(CORNER_RADIUS))
    .fill({ color: theme.background, alpha: 0.97 })
    .stroke({ width: BORDER_WIDTH, color: theme.text, alpha: BORDER_ALPHA, alignment: 1 });
}
