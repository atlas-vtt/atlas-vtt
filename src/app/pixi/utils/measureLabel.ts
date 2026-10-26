import { Container, Graphics, Text } from 'pixi.js';
import { NAMEPLATE_TEXT, TOKEN_TEXT_RESOLUTION } from '../token-renderer/tokenSizing';
import { canvasBadgeColors, isDarkTheme } from './canvasBadgeColors';
import { INK_SHADE } from './canvasInk';
import { destroyTree } from './destroyTree';
import { LABEL_LOOK, labelCenter, labelScale, labelTextResolution, pillSize, type LabelTarget, type Size } from './measureLabelLayout';

/** The label's colours: the nameplate's, its rim mixed opaque from the nameplate's translucent border. */
export function labelColors(): { readonly text: number; readonly background: number; readonly border: number } {
  const { background, stroke } = canvasBadgeColors();
  return { text: stroke, background, border: mix(background, stroke, isDarkTheme() ? 0.4 : 0.3) };
}

function mix(from: number, to: number, share: number): number {
  const channel = (shift: number): number => Math.round(((from >> shift) & 0xff) * (1 - share) + ((to >> shift) & 0xff) * share);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The screen's pixels per CSS pixel, where there is a screen. */
function deviceRatio(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
}

/**
 * A measurement's distance on a pill in the nameplate's look, laid out as token UI: in UI units, in a
 * container at the scale a selected token's UI has (`labelScale`), so a label and a nameplate side by
 * side are one family at every zoom. Its text is rasterised as the token UI's, more finely as it
 * grows on screen.
 */
export class MeasureLabel {
  readonly view = new Container({ label: 'measure-label', eventMode: 'none', interactiveChildren: false });
  readonly text = new Text({
    text: '',
    anchor: 0.5,
    resolution: TOKEN_TEXT_RESOLUTION,
    style: { fontFamily: NAMEPLATE_TEXT.fontFamily, fontSize: NAMEPLATE_TEXT.fontSize, fontWeight: NAMEPLATE_TEXT.fontWeight, fill: 0xffffff },
  });
  private readonly pill = new Graphics();
  private target: LabelTarget | null = null;
  private gridSize = 70;

  constructor() {
    this.text.scale.set(NAMEPLATE_TEXT.textScale);
    this.text.alpha = NAMEPLATE_TEXT.alpha;
    this.view.addChild(this.pill, this.text);
  }

  /** Shows `distance` at `target` (world units), at `zoom`, sized for a grid of `gridSize` pixels. */
  show(distance: string, target: LabelTarget, zoom: number, gridSize: number): void {
    if (this.text.text !== distance) this.text.text = distance;
    this.target = target;
    this.gridSize = gridSize;
    this.redraw(zoom);
  }

  /** Draws the label again where it stands: the zoom or the theme changed. */
  redraw(zoom: number): void {
    const viewZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const uiScale = labelScale(this.gridSize, viewZoom);
    const onScreen = uiScale * viewZoom;
    const resolution = labelTextResolution(uiScale, viewZoom, deviceRatio());
    // Every change of resolution rasterises the text again.
    if (this.text.resolution !== resolution) this.text.resolution = resolution;
    const colors = labelColors();
    if (this.text.style.fill !== colors.text) this.text.style.fill = colors.text;
    const bounds = this.text.getLocalBounds();
    const size = pillSize({ width: bounds.width * NAMEPLATE_TEXT.textScale, height: bounds.height * NAMEPLATE_TEXT.textScale });
    this.drawPill(size, colors, onScreen);
    const screenSize = { width: size.width * onScreen, height: size.height * onScreen };
    const center = this.target && labelCenter(this.target, screenSize, viewZoom, LABEL_LOOK.gap * onScreen);
    if (!center) return;
    this.view.scale.set(uiScale);
    this.view.position.set(center.x / viewZoom, center.y / viewZoom);
  }

  destroy(): void {
    destroyTree(this.view);
  }

  /**
   * The pill in UI units, opaque, with the ink's soft shade beside it in screen pixels (`onScreen`
   * per UI unit): no translucent piece lies over another.
   */
  private drawPill({ width, height, radius }: Size & { radius: number }, colors: ReturnType<typeof labelColors>, onScreen: number): void {
    const g = this.pill.clear();
    let edge = 0;
    for (const band of INK_SHADE) {
      const bandWidth = band.width / onScreen;
      const grow = edge + bandWidth / 2;
      g.roundRect(-width / 2 - grow, -height / 2 - grow, width + 2 * grow, height + 2 * grow, radius + grow)
        .stroke({ width: bandWidth, color: 0x000000, alpha: band.alpha });
      edge += bandWidth;
    }
    const inset = LABEL_LOOK.border;
    g.roundRect(-width / 2, -height / 2, width, height, radius).fill(colors.border);
    g.roundRect(-width / 2 + inset, -height / 2 + inset, width - 2 * inset, height - 2 * inset, radius - inset).fill(colors.background);
  }
}

/** Calls `redraw` whenever Obsidian switches between its light and dark theme; returns what stops it. */
export function watchMeasureLabelTheme(redraw: () => void): () => void {
  let dark = isDarkTheme();
  const observer = new MutationObserver(() => {
    if (isDarkTheme() === dark) return;
    dark = isDarkTheme();
    redraw();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
