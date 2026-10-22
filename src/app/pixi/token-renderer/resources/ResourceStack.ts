import { Container, type Ticker } from 'pixi.js';
import { barDimensions } from '../../../styles/designTokens';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { ResourceBarView } from './ResourceBarView';

/** Diameter of a bar's +/- button, in UI units: a bar's height. It stands `barDimensions.token.gap` beside the bar. */
export const BAR_BUTTON_SIZE = 10;

/** Where one resource sits on its token, in the units of its anchor; the click areas and +/- controls lay out from it. */
export interface ResourceSlot {
  key: string;
  /** The anchor it hangs from: a bar from the token's bottom edge, a wheel from the anchor on its right, a left wheel from the one on its left. */
  kind: 'bar' | 'wheel' | 'wheel-left';
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * A token's bars below it, stacked top to bottom. One view is kept per resource and
 * updated in place; a view is created or destroyed only when its resource appears
 * or disappears.
 */
export class ResourceStack {
  readonly view = new Container();
  private readonly views = new Map<string, ResourceBarView>();
  private slots: ResourceSlot[] = [];
  private textAlpha = 0;
  private resolution: number | undefined;

  constructor(private readonly ticker: Ticker | null) {}

  /** Shows `resources` as bars starting at `top`; returns the height they take, gaps included. */
  update(resources: readonly VisibleResource[], top: number, animate: boolean): number {
    const { width, gap } = barDimensions.token;
    const shown = new Set(resources.map(({ definition }) => definition.key));
    for (const [key, view] of this.views) {
      if (shown.has(key)) continue;
      view.destroy();
      this.views.delete(key);
    }

    this.slots = [];
    let y = top;
    for (const resource of resources) {
      const height = this.barFor(resource.definition.key).update(resource, y, animate);
      this.slots.push({ key: resource.definition.key, kind: 'bar', top: y, left: -width / 2, width, height });
      y += height + gap;
    }
    return y - top;
  }

  layout(): readonly ResourceSlot[] {
    return this.slots;
  }

  /** Opacity of the bars' "x / y" numbers, which show on hover and selection. */
  getTextAlpha(): number {
    return this.textAlpha;
  }

  setTextAlpha(alpha: number): void {
    this.textAlpha = alpha;
    for (const view of this.views.values()) view.setTextAlpha(alpha);
  }

  /** Rasterisation resolution of the texts, also of views created later. */
  setResolution(resolution: number): void {
    this.resolution = resolution;
    for (const view of this.views.values()) view.setResolution(resolution);
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.view.destroy();
  }

  private barFor(key: string): ResourceBarView {
    const existing = this.views.get(key);
    if (existing) return existing;
    const view = new ResourceBarView(this.ticker);
    view.setTextAlpha(this.textAlpha);
    if (this.resolution !== undefined) view.setResolution(this.resolution);
    this.views.set(key, view);
    this.view.addChild(view.view);
    return view;
  }
}
