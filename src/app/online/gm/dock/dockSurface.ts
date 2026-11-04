import { animatePanelIn, animatePanelOutAndRemove } from '../../../ui/panelMotion';
import { surfaceRise } from './dockDom.ts';

export interface SurfaceHost {
  /** The control: the button's box, which the surface hangs from. */
  readonly root: HTMLElement;
  /** The tallest the surface may be, from where it stands up to the room there is. */
  maxHeight(surfaceBottom: number): number;
  /** The surface's size or place changed: what hangs from it moves along. */
  moved(): void;
}

/**
 * The menu or panel the control opens: a surface of its own above the button, its left edge on the
 * button's, as the toolbar's tool menus hang above their buttons. The button stays where it is.
 * Menu and panel share the surface: changing between them swaps its content in place. Its place is
 * worked out from its width, its height and its CSS `bottom`, never from its client rect, which the
 * opening motion's transform distorts.
 */
export class DockSurface {
  private readonly host: SurfaceHost;
  private el: HTMLElement | null = null;
  private layer: HTMLElement | null = null;
  private width = 0;
  private readonly resizes: ResizeObserver;

  constructor(host: SurfaceHost) {
    this.host = host;
    // The next frame: fitting sets the content's room, which an observer must not change in its own callback.
    this.resizes = new ResizeObserver(() => host.root.win.requestAnimationFrame(() => this.fit()));
  }

  /** The content of the open surface, or null while it is closed. */
  get current(): HTMLElement | null {
    return this.layer;
  }

  /** Opens the surface on `layer`, `width` wide; an open surface changes to it. */
  open(layer: HTMLElement, width: number): void {
    const opening = this.el === null;
    const root = this.host.root;
    const el = this.el ?? root.createDiv({ cls: 'atlas-online-surface' });
    this.el = el;
    this.width = width;
    // The button's border as the browser draws it (snapped to device pixels), so the surface's left edge lies on the button's.
    root.setCssProps({ '--atlas-online-dock-border': root.win.getComputedStyle(root).borderLeftWidth });
    el.setCssProps({ width: `${width}px` });
    layer.addClass('atlas-online-layer');
    if (this.layer !== layer) {
      this.layer?.remove();
      el.appendChild(layer);
      this.layer = layer;
    }
    this.resizes.disconnect();
    this.resizes.observe(el);
    this.fit();
    if (opening) animatePanelIn(el);
  }

  /** Closes the surface; it fades out where it stands. */
  close(): void {
    const el = this.el;
    if (el === null) return;
    this.resizes.disconnect();
    this.el = null;
    this.layer = null;
    this.clearReach();
    animatePanelOutAndRemove(el);
    this.host.moved();
  }

  /** Gone at once, without motion. */
  dispose(): void {
    this.resizes.disconnect();
    this.el?.remove();
    this.el = null;
    this.layer = null;
  }

  /** Sizes the content to the room there is (after the content or the view changed). */
  fit(): void {
    const { el, layer } = this;
    if (el === null || layer === null) return;
    const root = this.host.root;
    const button = root.getBoundingClientRect();
    const rise = surfaceRise(root, el);
    const max = this.host.maxHeight(button.top - rise);
    // The content scrolls inside the room there is; its own height then fits it.
    if (Number.isFinite(max)) layer.setCssProps({ '--atlas-online-layer-max': `${Math.max(0, max - (el.offsetHeight - el.clientHeight))}px` });
    // How far the surface reaches above and beside the button: the newcomers' cards stand above it, the QR card beside it.
    root.setCssProps({
      '--atlas-online-above': `${Math.max(0, rise + el.offsetHeight)}px`,
      '--atlas-online-wider': `${Math.max(0, this.width - button.width)}px`,
    });
    this.host.moved();
  }

  private clearReach(): void {
    this.host.root.setCssProps({ '--atlas-online-above': '', '--atlas-online-wider': '' });
  }
}
