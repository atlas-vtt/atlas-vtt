import { MARKS_INTERVAL_MS, type SharedCursor } from '../protocol/index.ts';
import { getDomHost } from '../../host/dom';
import type { OverlayHost } from './MarkOverlay.ts';
import { RemoteCursors } from './RemoteCursors.ts';

/** The class of the marks overlay's canvas, which the cursors lie above. */
const MARKS_CANVAS = 'atlas-online-marks';
/** A camera that has not moved for this long has settled: cursors at rest go back onto whole pixels. */
const CAMERA_SETTLE_MS = 120;

/**
 * Other people's cursors over a map: a layer of elements laid over the map's canvas (and over the
 * marks overlay, when there is one), which lets every pointer event through. It draws on the display
 * frames of the canvas's own window, and only while a cursor is drawn or fading: with nobody's cursor
 * on the map it asks for no frame. It also draws at once whenever the viewport says its camera moved:
 * a pan or zoom changes the camera inside the map's own frame (a smooth zoom's step) or a scroll
 * event, and a frame of its own, before or after the map's in the same display frame, would place the
 * cursors by the camera of the frame before as often as not. Its layer is made with the first cursor
 * to show.
 */
export class CursorOverlay {
  private readonly labelOf: (cursor: SharedCursor) => string;
  private layer: HTMLDivElement | null = null;
  private cursors: RemoteCursors | null = null;
  private host: OverlayHost | null = null;
  private frame: number | null = null;
  private size = { width: -1, height: -1 };
  /** The camera last drawn with, and since when it has not moved. */
  private camera = { x: Number.NaN, y: Number.NaN, scale: Number.NaN };
  private cameraSince = 0;
  private readonly onCamera = (): void => {
    if (this.draw()) this.wake();
  };

  /** `labelOf` names a cursor's tag. */
  constructor(labelOf: (cursor: SharedCursor) => string) {
    this.labelOf = labelOf;
  }

  /** Shows `cursors` as they are now over `host`'s map: everyone's but the viewer's own. */
  show(cursors: readonly SharedCursor[], host: OverlayHost): void {
    if (this.cursors === null && cursors.length === 0) return;
    this.attach(host);
    this.cursors?.update(cursors, performance.now());
    this.wake();
  }

  /** How far `who`'s cursor is drawn behind its messages now, in ms, or null while it shows none. */
  lagOf(who: string): number | null {
    return this.cursors?.lagOf(who, performance.now()) ?? null;
  }

  /** Nobody's cursor shows; what is drawn fades away. */
  clear(): void {
    if (this.host !== null) this.cursors?.update([], performance.now());
    this.wake();
  }

  dispose(): void {
    this.detach();
    this.stop();
    this.cursors?.clear();
    this.layer?.remove();
    this.layer = null;
    this.cursors = null;
    this.host = null;
  }

  /** Lays the layer over `host`'s canvas, above the marks overlay's; a new canvas moves it. */
  private attach(host: OverlayHost): void {
    if (this.host?.canvas === host.canvas && this.host.viewport === host.viewport && this.layer?.isConnected === true) return;
    this.stop();
    this.detach();
    this.host = host;
    host.viewport.on('moved', this.onCamera);
    host.viewport.on('zoomed', this.onCamera);
    const layer = this.layer ?? getDomHost().createDiv(host.canvas.ownerDocument.body, 'atlas-online-cursors');
    this.layer = layer;
    this.cursors ??= new RemoteCursors(layer, this.labelOf, MARKS_INTERVAL_MS);
    let anchor: Element = host.canvas;
    while (anchor.nextElementSibling?.classList.contains(MARKS_CANVAS) === true) anchor = anchor.nextElementSibling;
    anchor.after(layer);
    this.size = { width: -1, height: -1 };
  }

  private detach(): void {
    this.host?.viewport.off('moved', this.onCamera);
    this.host?.viewport.off('zoomed', this.onCamera);
  }

  private wake(): void {
    const view = this.host?.canvas.ownerDocument.defaultView;
    if (this.frame !== null || view === null || view === undefined || this.cursors === null) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.tick();
    });
  }

  private stop(): void {
    if (this.frame !== null) this.host?.canvas.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private tick(): void {
    // While a cursor is drawn the camera is read every frame: a camera that moves without a word still moves it.
    if (this.draw()) this.wake();
  }

  /** Draws the cursors as they are now; false once there is nothing left to draw. */
  private draw(): boolean {
    const { host, layer, cursors } = this;
    if (host === null || layer === null || cursors === null || cursors.size === 0) return false;
    // The map under the layer is gone: its cursors go with it until they are shown over a live one.
    if (host.viewport.destroyed === true || !host.canvas.isConnected) {
      cursors.clear();
      layer.remove();
      return false;
    }
    const { clientWidth: width, clientHeight: height } = host.canvas;
    if (width !== this.size.width || height !== this.size.height) {
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
      this.size = { width, height };
    }
    const view = host.canvas.ownerDocument.defaultView;
    const now = performance.now();
    const camera = { x: host.viewport.x, y: host.viewport.y, scale: host.viewport.scale.x };
    if (camera.x !== this.camera.x || camera.y !== this.camera.y || camera.scale !== this.camera.scale) {
      this.camera = camera;
      this.cameraSince = now;
    }
    cursors.tick(now, camera, view?.devicePixelRatio || 1, now - this.cameraSince >= CAMERA_SETTLE_MS);
    return cursors.size > 0;
  }
}
