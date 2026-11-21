import { Container, Graphics, Text } from 'pixi.js';
import { canvasBadgeColors, isDarkTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { NAMEPLATE_HEIGHT, NAMEPLATE_TEXT, TOKEN_TEXT_RESOLUTION } from './tokenSizing';

/** Screen pixels per UI unit: its text is as large as the condition card's (13 px). */
const SCREEN_SIZE = 13 / (NAMEPLATE_TEXT.fontSize * NAMEPLATE_TEXT.textScale);
/** Between the chip and what it stands clear of, in screen pixels. */
const CLEAR_GAP = 4;

/**
 * A token's height on a pill in the nameplate's look ("↑ 30ft"), over the top of the token as the
 * nameplate and the bars are under its foot: just above its ring, clear of the badges that sit on
 * the ring there (conditions fan out up to the top, the instance number sits to its right). Laid
 * out in UI units like the nameplate, it keeps one size on screen at any zoom, like the condition
 * card. It is drawn again only when its text or the theme is another.
 */
export class HeightChip {
  readonly view = new Container({ label: 'heightChip', eventMode: 'none', interactiveChildren: false });
  private readonly pill = new Graphics();
  private readonly text = new Text({
    text: '',
    anchor: 0.5,
    resolution: TOKEN_TEXT_RESOLUTION,
    style: { fontFamily: NAMEPLATE_TEXT.fontFamily, fontSize: NAMEPLATE_TEXT.fontSize, fontWeight: NAMEPLATE_TEXT.fontWeight, fill: 0xffffff },
  });
  /** The text and theme the pill was last drawn for. */
  private drawn = '';

  constructor() {
    this.text.scale.set(NAMEPLATE_TEXT.textScale);
    this.text.alpha = NAMEPLATE_TEXT.alpha;
    this.view.addChild(this.pill, this.text);
    this.view.visible = false;
  }

  /** Writes `text` on the chip; an empty one leaves nothing to show. */
  write(text: string): void {
    const dark = isDarkTheme();
    const key = `${dark}|${text}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.pill.clear();
    this.text.text = text;
    if (text === '') return;
    const { background, stroke } = canvasBadgeColors();
    if (this.text.style.fill !== stroke) this.text.style.fill = stroke;
    const height = NAMEPLATE_HEIGHT;
    const width = Math.max(height, this.text.getLocalBounds().width * NAMEPLATE_TEXT.textScale + NAMEPLATE_TEXT.padding * 2);
    this.pill
      .roundRect(-width / 2, -height / 2, width, height, height / 2)
      .fill({ color: background })
      .roundRect(-width / 2, -height / 2, width, height, height / 2)
      .stroke({ width: 0.5, color: stroke, alpha: dark ? 0.4 : 0.3 });
  }

  /**
   * Stands the chip over the top of the token's ring, which lies `ringRadius` world units from the
   * token's centre, at `screenScale` world units per screen pixel: its lower edge clear of what
   * reaches `reach` world units above the ring there (its edge, a badge, the rotate button).
   */
  place(ringRadius: number, screenScale: number, reach: number): void {
    const scale = SCREEN_SIZE * screenScale;
    this.view.scale.set(scale);
    this.view.position.set(0, -(ringRadius + reach + CLEAR_GAP * screenScale + (NAMEPLATE_HEIGHT / 2) * scale));
  }

  destroy(): void {
    destroyTree(this.view);
  }
}
