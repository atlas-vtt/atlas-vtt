import { Container, Graphics, Text } from 'pixi.js';
import { pinSize } from '../styles/designTokens';
import { NAMEPLATE_TEXT } from './token-renderer/tokenSizing';
import { labelTextResolution, pillSize } from './utils/measureLabelLayout';
import { drawLabelPill, labelColors } from './utils/measureLabel';
import type { Box } from '../utils/labelDeclutter';

/**
 * How large a pin's name is next to its badge, in the badge's units: the nameplate's pill at this
 * scale is 24 px tall beside the 40 px badge, a map label's size, smaller than a selected token's
 * nameplate, which names one thing in a fight rather than a place among many.
 */
const NAME_SCALE = 1.75;

/** Room between the badge and its name, in the badge's units. */
const NAME_GAP = 4;

/** The screen's pixels per CSS pixel, where there is a screen. */
function deviceRatio(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
}

/**
 * A pin's name on a pill in the nameplate's look, centred under the badge, in the pin group's units:
 * the group keeps the badge's size on screen (`mapMarkerScale`), so the name keeps it too.
 */
export class PinNameLabel {
  readonly view = new Container({ label: 'pin-name', eventMode: 'none', interactiveChildren: false });
  private readonly pill = new Graphics();
  private readonly text: Text;
  private size = { width: 0, height: 0 };
  /** What the last draw drew for: the same again draws nothing (a drag lays the names out at every step). */
  private drawn = '';

  constructor(name: string) {
    this.text = new Text({
      text: name,
      anchor: 0.5,
      style: { fontFamily: NAMEPLATE_TEXT.fontFamily, fontSize: NAMEPLATE_TEXT.fontSize, fontWeight: NAMEPLATE_TEXT.fontWeight, fill: 0xffffff },
    });
    this.text.scale.set(NAMEPLATE_TEXT.textScale);
    this.text.alpha = NAMEPLATE_TEXT.alpha;
    this.view.addChild(this.pill, this.text);
    this.view.scale.set(NAME_SCALE);
  }

  /** Draws the name for a group at `pinScale` on a viewport at `zoom`: its colours, its pill and how finely its text is rasterised. */
  draw(pinScale: number, zoom: number): void {
    const uiScale = NAME_SCALE * pinScale;
    const resolution = labelTextResolution(uiScale, zoom, deviceRatio());
    const colors = labelColors();
    // The shade's bands are in screen pixels, so the pill changes only with its size on screen.
    const key = `${resolution}|${(uiScale * zoom).toFixed(3)}|${colors.text}|${colors.background}`;
    if (key === this.drawn) return;
    this.drawn = key;
    if (this.text.resolution !== resolution) this.text.resolution = resolution;
    if (this.text.style.fill !== colors.text) this.text.style.fill = colors.text;
    const bounds = this.text.getLocalBounds();
    const size = pillSize({ width: bounds.width * NAMEPLATE_TEXT.textScale, height: bounds.height * NAMEPLATE_TEXT.textScale });
    drawLabelPill(this.pill.clear(), size, colors, uiScale * zoom);
    this.size = size;
    this.view.position.set(0, pinSize.badgeRadius + NAME_GAP + (size.height * NAME_SCALE) / 2);
  }

  /** The pill's box in the pin group's units, around the badge's centre; for the overlap of names. */
  box(): Box {
    const halfWidth = (this.size.width * NAME_SCALE) / 2;
    const top = this.view.position.y - (this.size.height * NAME_SCALE) / 2;
    return { left: -halfWidth, top, right: halfWidth, bottom: top + this.size.height * NAME_SCALE };
  }
}
