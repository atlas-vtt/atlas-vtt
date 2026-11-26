import { OverlayScrollbar, type OverlayScrollbarHost } from './OverlayScrollbar';
import { atlasScrollHost, scrollAxes, scrollsBare } from './scrollAreas';

/** Beyond this many elements noted as scrolled, the ones no longer in the page are forgotten. */
const SCROLLED_PRUNE_AT = 128;

interface ScrollOffset {
  element: Element;
  top: number;
  left: number;
}

/**
 * The overlay scrollbars of one document (the main window or a popout). Nothing is set up per area in advance:
 * one passive scroll and one pointer listener on the document find an area the moment it scrolls or the pointer
 * enters it, and only then is its scrollbar made. An area is measured when its thumbs are about to show (in the
 * next frame) and when its size changes while they show (a ResizeObserver), never on every scroll.
 */
export class OverlayScrollbars implements OverlayScrollbarHost {
  private readonly bars = new WeakMap<Element, OverlayScrollbar>();
  private readonly refused = new WeakSet<Element>();
  /** Elements that scrolled: giving an area a shadow root lays its subtree out anew, which resets their offsets. */
  private readonly scrolled = new Set<Element>();
  private readonly pending = new Set<OverlayScrollbar>();
  private readonly resizes: ResizeObserver | null;
  private hovered: HTMLElement[] = [];
  private frameRequest = 0;

  constructor(private readonly doc: Document) {
    const win = doc.defaultView;
    this.resizes = win && typeof win.ResizeObserver === 'function'
      ? new win.ResizeObserver((entries) => {
        for (const entry of entries) {
          const bar = this.bars.get(entry.target);
          if (bar) this.schedule(bar);
        }
      })
      : null;
    doc.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    doc.addEventListener('pointerover', this.onPointerOver, { capture: true, passive: true });
    doc.addEventListener('pointerout', this.onPointerOut, { capture: true, passive: true });
  }

  /** Removes every scrollbar of the document and stops listening. */
  destroy(): void {
    this.doc.removeEventListener('scroll', this.onScroll, { capture: true });
    this.doc.removeEventListener('pointerover', this.onPointerOver, { capture: true });
    this.doc.removeEventListener('pointerout', this.onPointerOut, { capture: true });
    if (this.frameRequest) this.doc.defaultView?.cancelAnimationFrame(this.frameRequest);
    this.resizes?.disconnect();
    for (const area of Array.from(this.doc.querySelectorAll('[data-atlas-scrollbar]'))) this.bars.get(area)?.destroy();
    this.pending.clear();
    this.scrolled.clear();
    this.hovered = [];
  }

  shown(bar: OverlayScrollbar): void {
    this.resizes?.observe(bar.area);
  }

  hidden(bar: OverlayScrollbar): void {
    this.resizes?.unobserve(bar.area);
  }

  private readonly onScroll = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.nodeType !== 1) return;
    this.noteScrolled(target);
    const area = atlasScrollHost(target);
    const bar = area && this.barFor(area);
    if (!bar) return;
    // Scrolling moves the thumbs by itself; their size changes only with the area's (the ResizeObserver).
    if (bar.isShown) bar.reveal();
    else this.schedule(bar);
  };

  /** Shows the scrollbars of the areas the pointer has just entered; a touch shows them only by scrolling. */
  private readonly onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    const areas: HTMLElement[] = [];
    for (const node of event.composedPath()) {
      const area = atlasScrollHost(node);
      if (area && this.scrollsByStyle(area)) areas.push(area);
    }
    const entered = areas.filter((area) => !this.hovered.includes(area));
    this.hovered = areas;
    // Outermost first: its shadow root is made before an inner area's offset is noted.
    for (const area of entered.reverse()) {
      const bar = this.barFor(area);
      if (bar) this.schedule(bar);
    }
  };

  private readonly onPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget === null) this.hovered = [];
  };

  private scrollsByStyle(area: HTMLElement): boolean {
    if (this.bars.has(area)) return true;
    const style = area.win.getComputedStyle(area);
    const axes = scrollAxes(style);
    return (axes.y || axes.x) && !scrollsBare(style);
  }

  private barFor(area: HTMLElement): OverlayScrollbar | null {
    const known = this.bars.get(area);
    if (known) return known;
    if (this.refused.has(area) || !this.scrollsByStyle(area)) return null;
    const root = this.shadowRootOf(area);
    if (!root) {
      this.refused.add(area);
      return null;
    }
    const bar = new OverlayScrollbar(area, root, this);
    this.bars.set(area, bar);
    return bar;
  }

  /** The area's shadow root: one made before (a reloaded Atlas), or a new one, the scroll offsets in it kept. */
  private shadowRootOf(area: HTMLElement): ShadowRoot | null {
    if (area.shadowRoot) return OverlayScrollbar.owns(area.shadowRoot) ? area.shadowRoot : null;
    const offsets = this.offsetsWithin(area);
    let root: ShadowRoot;
    try {
      root = area.attachShadow({ mode: 'open' });
    } catch {
      return null;
    }
    OverlayScrollbar.prepare(root);
    for (const { element, top, left } of offsets) element.scrollTo({ top, left, behavior: 'instant' });
    return root;
  }

  private offsetsWithin(area: HTMLElement): ScrollOffset[] {
    const offsets: ScrollOffset[] = [];
    for (const element of [area, ...this.scrolled]) {
      if (!element.isConnected) {
        this.scrolled.delete(element);
        continue;
      }
      if ((element === area || area.contains(element)) && (element.scrollTop !== 0 || element.scrollLeft !== 0)) {
        offsets.push({ element, top: element.scrollTop, left: element.scrollLeft });
      }
    }
    return offsets;
  }

  private noteScrolled(element: Element): void {
    this.scrolled.add(element);
    if (this.scrolled.size < SCROLLED_PRUNE_AT) return;
    for (const known of this.scrolled) {
      if (!known.isConnected || (known.scrollTop === 0 && known.scrollLeft === 0)) this.scrolled.delete(known);
    }
  }

  private schedule(bar: OverlayScrollbar): void {
    this.pending.add(bar);
    if (this.frameRequest) return;
    const win = this.doc.defaultView;
    if (win) this.frameRequest = win.requestAnimationFrame(this.flush);
  }

  private readonly flush = (): void => {
    this.frameRequest = 0;
    const bars = Array.from(this.pending);
    this.pending.clear();
    for (const bar of bars) {
      if (bar.area.isConnected && bar.measure()) bar.reveal();
      else bar.hide();
    }
  };
}
