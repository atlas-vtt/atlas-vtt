/**
 * The name of the fog area whose badge the pointer is on: a small label beside the badge, in the
 * badge's own colours, as large on screen at any zoom. One label serves every badge, since only
 * one is pointed at.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { NAMEPLATE_TEXT } from '../token-renderer/tokenSizing';
import type { CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { FOG_BADGE_RADIUS } from './fogAreaBadge';

/** Screen pixels at marker scale 1. */
const NAME_PX = 12;
/** The size the text is drawn at; shown at `NAME_PX`, so a screen of two pixels to the point gets every pixel it has. */
const DRAWN_PX = 2 * NAME_PX;
/** Room around the text inside the label, and between the badge and the label. */
const PADDING = 5;
const GAP = 4;
const CORNER = 6;

export class FogAreaName {
  readonly view = new Container({ label: 'fog-area-name', eventMode: 'none', interactiveChildren: false, visible: false });
  private readonly plate = new Graphics();
  private readonly text = new Text({
    text: '',
    anchor: { x: 0, y: 0.5 },
    resolution: 1,
    style: { fontFamily: NAMEPLATE_TEXT.fontFamily, fontSize: DRAWN_PX, fontWeight: NAMEPLATE_TEXT.fontWeight, fill: 0xffffff },
  });
  /** What the label was last drawn as. */
  private drawn = '';

  constructor() {
    this.text.scale.set(NAME_PX / DRAWN_PX);
    this.view.addChild(this.plate, this.text);
  }

  /**
   * Shows `name` beside the badge at the world point `at`, at marker scale `scale`; null (or no
   * name) shows none. `room` is how far the view reaches to the badge's right, in the label's
   * own pixels: a label that does not fit there stands on the badge's left.
   */
  show(name: string | null, at: { x: number; y: number } | null, scale: number, theme: CanvasBadgeTheme, room = Infinity): void {
    this.view.visible = name !== null && at !== null;
    if (name === null || at === null) return;
    this.view.position.set(at.x, at.y);
    this.view.scale.set(scale);
    if (this.text.text !== name) this.text.text = name;
    const width = this.text.width + 2 * PADDING;
    const left = FOG_BADGE_RADIUS + GAP + width > room;
    const key = `${name}|${theme.background}|${theme.stroke}|${left}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.text.style.fill = theme.stroke;
    const height = NAME_PX + 2 * PADDING + 2;
    const from = left ? -(FOG_BADGE_RADIUS + GAP + width) : FOG_BADGE_RADIUS + GAP;
    this.text.position.set(from + PADDING, 0);
    this.plate.clear();
    this.plate.roundRect(from, -height / 2, width, height, CORNER).fill({ color: theme.background, alpha: 0.95 }).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  }
}
