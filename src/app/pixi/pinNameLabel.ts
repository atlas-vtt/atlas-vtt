import { Container, Text } from 'pixi.js';
import { pinSize } from '../styles/designTokens';
import { NAMEPLATE_TEXT } from './token-renderer/tokenSizing';
import { canvasBadgeColors } from './utils/canvasBadgeColors';
import type { Box } from '../utils/labelDeclutter';

/** The name's size on screen in CSS pixels: a map label's, read at a glance without covering the map. */
const NAME_PX = 12;

/** The size the text is drawn at; shown at `NAME_PX`, so a screen of two pixels to the point gets every pixel it has. */
const DRAWN_PX = 2 * NAME_PX;

/** The halo around the letters, in drawn pixels: it keeps them readable over any map without a box that hides it. */
const HALO = 5;

/** Room between the badge and its name, in screen pixels. */
const NAME_GAP = 3;

/**
 * A pin's name under its badge, the way a map labels a place: text in the theme's ink with a halo
 * of the badge's colour, no box. It keeps one size on screen whatever the zoom, also where the
 * badges grow on a map zoomed far out (`mapMarkerScale`), so a name never grows over the map.
 */
export class PinNameLabel {
  readonly view = new Container({ label: 'pin-name', eventMode: 'none', interactiveChildren: false });
  private readonly text: Text;
  /** What the last draw drew for: the same again draws nothing (a drag lays the names out at every step). */
  private drawn = '';

  constructor(name: string) {
    this.text = new Text({
      text: name,
      anchor: { x: 0.5, y: 0 },
      resolution: 1,
      style: {
        fontFamily: NAMEPLATE_TEXT.fontFamily,
        fontSize: DRAWN_PX,
        fontWeight: NAMEPLATE_TEXT.fontWeight,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: HALO, join: 'round' },
      },
    });
    this.view.addChild(this.text);
  }

  /** Draws the name for a pin group at `pinScale` on a viewport at `zoom`: its colours, its size and its place under the badge. */
  draw(pinScale: number, zoom: number): void {
    const { stroke: ink, background } = canvasBadgeColors();
    const perScreenPixel = 1 / (pinScale * zoom);
    const key = `${perScreenPixel.toFixed(5)}|${ink}|${background}`;
    if (key === this.drawn) return;
    this.drawn = key;
    if (this.text.style.fill !== ink) this.text.style.fill = ink;
    this.text.style.stroke = { color: background, width: HALO, join: 'round' };
    // The group's units are screen pixels only while the badges keep their size, so scale by the group's own
    this.view.scale.set((NAME_PX / DRAWN_PX) * perScreenPixel);
    this.view.position.set(0, pinSize.badgeRadius + NAME_GAP * perScreenPixel);
  }

  /** The name's box in the pin group's units, around the badge's centre; for the overlap of names. */
  box(): Box {
    const bounds = this.text.getLocalBounds();
    const scale = this.view.scale.x;
    return {
      left: this.view.x + bounds.minX * scale,
      top: this.view.y + bounds.minY * scale,
      right: this.view.x + bounds.maxX * scale,
      bottom: this.view.y + bounds.maxY * scale,
    };
  }
}
