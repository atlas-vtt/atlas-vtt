import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { NotePin } from '../../types';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import { axialToPixel, hexCellExtent, hexVertices, pixelToAxial } from '../../grid/hexGeometry';
import type { AxialCoord, HexLayout, Point } from '../../grid/hexGeometry';
import { hexLayoutOfGrid, hexLinkAt, isShownAsHex, linkedHexOf } from '../../grid/hexLinks';
import { axialKey, hexLattice } from '../../grid/hexLattice';
import { cellLabelsByKey, numberCells } from '../../grid/cellNumbering';
import type { MapRect } from '../../grid/cellNumbering';
import { noteLinkTitle } from '../../utils/pathUtils';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { createHexLinkChip } from './hexLinkChip';

const HOVER_FILL_ALPHA = 0.28;
const PRESSED_FILL_ALPHA = 0.45;
/** Gap between the chip and the top of its hex, in screen pixels. */
const CHIP_GAP = 6;

type HighlightState = 'hover' | 'pressed' | 'preview';

interface Highlight {
  hex: AxialCoord;
  state: HighlightState;
  pin: NotePin | null;
}

export interface HexLinkRendererOptions {
  viewport: Viewport;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  /** The map image in world space, which decides the hex numbers. */
  getMapRect: () => MapRect | null;
}

/**
 * Highlights linked hexes: the one under the pointer, the one being pressed,
 * and the one the note pin tool would link while Shift is held. It lights up
 * with a chip naming its number and note. At rest a linked hex shows only its
 * pin (drawn by `PinRenderer`). DM-only, like pins.
 */
export class HexLinkRenderer {
  readonly container = new Container({ label: 'hex-links', eventMode: 'none', interactiveChildren: false });
  private readonly highlightGraphics = new Graphics();
  private chip: Container | null = null;
  private highlight: Highlight | null = null;
  private hoveredPinId: string | null = null;
  private pressedPinId: string | null = null;
  private previewPoint: Point | null = null;
  private numbering: { key: string; labels: Map<string, string> } | null = null;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly options: HexLinkRendererOptions) {
    const { store, eventBus, viewport } = options;
    this.container.addChild(this.highlightGraphics);

    this.unsubscribers.push(
      store.subscribe((state: ViewAtlasState) => state.objects.pins, () => this.redraw()),
      store.subscribe((state: ViewAtlasState) => state.grid, () => this.redraw()),
      store.subscribe((state: ViewAtlasState) => state.isGMView, () => this.redraw()),
    );

    const onPreview = (point: Point): void => this.setPreview(point);
    const onPreviewHide = (): void => this.setPreview(null);
    eventBus.on('hex-link-preview', onPreview);
    eventBus.on('hex-link-preview-hide', onPreviewHide);
    const onZoom = (): void => this.scaleChip();
    viewport.on('zoomed', onZoom);
    this.unsubscribers.push(() => {
      eventBus.off('hex-link-preview', onPreview);
      eventBus.off('hex-link-preview-hide', onPreviewHide);
      viewport.off('zoomed', onZoom);
    });

    this.redraw();
  }

  private get state(): ViewAtlasState {
    return this.options.store.getState();
  }

  /** Linked hexes are the DM's notes: hidden in the player view and while the DM previews it. */
  private isHidden(): boolean {
    return this.state.isPlayerView || !this.state.isGMView;
  }

  private layout(): HexLayout | null {
    return hexLayoutOfGrid(this.state.grid);
  }

  /** The id of the linked pin whose hex contains the point, or null. */
  hitTest(worldX: number, worldY: number): string | null {
    const layout = this.layout();
    if (!layout || this.isHidden()) return null;
    const pin = hexLinkAt(this.state.objects.pins, layout, { x: worldX, y: worldY });
    // A hex whose note an add-on hides stays inert
    return pin && !this.state.objectMask.hidden[pin.id] ? pin.id : null;
  }

  setHovered(pinId: string | null): void {
    if (pinId === this.hoveredPinId) return;
    this.hoveredPinId = pinId;
    this.updateHighlight();
  }

  setPressed(pinId: string | null): void {
    if (pinId === this.pressedPinId) return;
    this.pressedPinId = pinId;
    this.updateHighlight();
  }

  /** Lights up the hex the note pin tool would link at `point`; null ends the preview. */
  setPreview(point: Point | null): void {
    this.previewPoint = point;
    this.updateHighlight();
  }

  /** The hex's number in the grid's format, or column and row when the grid shows none. */
  numberOf(hex: AxialCoord): string | undefined {
    const layout = this.layout();
    const map = this.options.getMapRect();
    if (!layout || !map) return undefined;
    const format = this.state.grid?.cellNumbers ?? 'column-row';
    const key = JSON.stringify([layout, map, format]);
    if (this.numbering?.key !== key) {
      this.numbering = { key, labels: cellLabelsByKey(numberCells(hexLattice(layout), map, format)) };
    }
    return this.numbering.labels.get(axialKey(hex));
  }

  private redraw(): void {
    this.container.visible = !this.isHidden() && this.layout() !== null;
    this.updateHighlight();
  }

  private currentHighlight(layout: HexLayout): Highlight | null {
    const pins = this.state.objects.pins;
    const pinId = this.pressedPinId ?? this.hoveredPinId;
    const pin = pinId ? pins[pinId] : undefined;
    if (pin && isShownAsHex(pin, layout)) {
      return { hex: linkedHexOf(pin, layout), state: this.pressedPinId ? 'pressed' : 'hover', pin };
    }
    if (this.previewPoint) {
      const hex = pixelToAxial(layout, this.previewPoint);
      return { hex, state: 'preview', pin: hexLinkAt(pins, layout, this.previewPoint) };
    }
    return null;
  }

  private updateHighlight(): void {
    const layout = this.layout();
    const next = layout && !this.isHidden() ? this.currentHighlight(layout) : null;
    if (sameHighlight(next, this.highlight)) return;
    this.highlight = next;

    this.highlightGraphics.clear();
    this.clearChip();
    if (!next || !layout) return;

    const accent = accentColor();
    const strokeWidth = layout.size * 0.04;
    drawHex(this.highlightGraphics, layout, next.hex, strokeWidth);
    this.highlightGraphics.fill({ color: accent, alpha: next.state === 'pressed' ? PRESSED_FILL_ALPHA : HOVER_FILL_ALPHA });
    this.highlightGraphics.stroke({ width: strokeWidth, color: accent, alpha: 1 });

    this.chip = createHexLinkChip({
      number: this.numberOf(next.hex),
      title: next.pin ? noteLinkTitle(next.pin.notePath) : undefined,
    });
    if (this.chip) {
      const center = axialToPixel(layout, next.hex);
      this.chip.position.set(center.x, center.y - hexCellExtent(layout).height / 2);
      this.chip.pivot.set(0, CHIP_GAP);
      this.container.addChild(this.chip);
      this.scaleChip();
    }
  }

  /** The chip keeps its screen size at every zoom, like pins. */
  private scaleChip(): void {
    if (!this.chip) return;
    this.chip.scale.set(1 / this.options.viewport.scale.x);
  }

  private clearChip(): void {
    if (this.chip) destroyTree(this.chip);
    this.chip = null;
  }

  destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.length = 0;
    this.chip = null;
    destroyTree(this.container);
  }
}

function sameHighlight(a: Highlight | null, b: Highlight | null): boolean {
  if (!a || !b) return a === b;
  return a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.state === b.state && a.pin === b.pin;
}

function accentColor(): number {
  return cssColorToHexNumber(getObsidianAccentColor());
}

/** Adds the hex's outline, inset so the centred stroke stays inside it and neighbours don't overlap. */
function drawHex(graphics: Graphics, layout: HexLayout, hex: AxialCoord, strokeWidth: number): void {
  const center = axialToPixel(layout, hex);
  const inset = 1 - strokeWidth / layout.size;
  const points = hexVertices(layout, center).flatMap((vertex) => [
    center.x + (vertex.x - center.x) * inset,
    center.y + (vertex.y - center.y) * inset,
  ]);
  graphics.poly(points, true);
}
