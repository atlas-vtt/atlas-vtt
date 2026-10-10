import { Container, Graphics, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { TV_VIEWPORT_ENABLED } from '../../featureFlags';
import { destroyTree } from '../utils/destroyTree';

const HANDLE_RADIUS = 10;
const HIT_TOLERANCE = 6;

/**
 * Renders GM-only TV viewport rectangles: the active rect's outline/fill,
 * a label, and (when unlocked) a single uniform-scale resize handle at the
 * bottom-right corner. Never visible in the player mirror.
 */
export class ViewportRectRenderer {
  readonly container: Container;
  private readonly rectGraphics: Graphics;
  private readonly handleGraphics: Graphics;
  private readonly label: Text;
  private readonly store: StoreApi<ViewAtlasState>;
  private readonly unsubscribe: () => void;

  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.store = store;

    this.container = new Container();
    this.container.label = 'viewportRectUI';
    this.container.zIndex = 1150;
    this.container.eventMode = 'none';
    this.container.visible = false;

    this.rectGraphics = new Graphics();
    this.handleGraphics = new Graphics();
    this.label = new Text({ text: 'TV Viewport', style: { fill: 0xffffff, fontSize: 14 } });

    this.container.addChild(this.rectGraphics);
    this.container.addChild(this.label);
    this.container.addChild(this.handleGraphics);

    viewport.addChild(this.container);

    this.unsubscribe = store.subscribe((state) => {
      // Stays visible while panning/using other tools, not just while the
      // viewport tool itself is selected, so the DM can always see the frame.
      const visible = TV_VIEWPORT_ENABLED && Object.keys(state.objects.viewports).length > 0;
      this.container.visible = visible;
      if (visible) this.redraw();
    });
  }

  forceRedraw(): void {
    this.redraw();
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible;
    if (visible) this.redraw();
  }

  private getActiveRect(): ViewAtlasState['objects']['viewports'][string] | undefined {
    return Object.values(this.store.getState().objects.viewports).find((vp) => vp.active);
  }

  private redraw(): void {
    this.rectGraphics.clear();
    this.handleGraphics.clear();

    const rects = Object.values(this.store.getState().objects.viewports);
    for (const rect of rects) {
      const color = rect.active ? 0x00ffff : 0xffffff;
      const alpha = rect.active ? 0.15 : 0.05;
      this.rectGraphics
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color, alpha })
        .stroke({ width: 2, color, alpha: rect.active ? 1 : 0.4 });
    }

    const active = this.getActiveRect();
    if (!active) {
      this.label.visible = false;
      return;
    }

    this.label.visible = true;
    this.label.position.set(active.x + 8, active.y - 20);

    // The resize handle is only meaningful (and hit-testable) while the
    // viewport tool itself is selected — otherwise it's just visual clutter.
    const viewportToolActive = this.store.getState().activeTool === 'viewport';
    if (!active.locked && viewportToolActive) {
      const hx = active.x + active.width;
      const hy = active.y + active.height;
      this.handleGraphics.circle(hx, hy, HANDLE_RADIUS).fill({ color: 0x00ffff, alpha: 0.9 }).stroke({ width: 1, color: 0xffffff });
    }
  }

  /** Returns the id of the viewport rect whose body contains this world point, or null. */
  hitTestBody(worldX: number, worldY: number): string | null {
    for (const rect of Object.values(this.store.getState().objects.viewports)) {
      if (worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y && worldY <= rect.y + rect.height) {
        return rect.id;
      }
    }
    return null;
  }

  /** Returns the active rect's id if this world point is on its resize handle (only when unlocked). */
  hitTestHandle(worldX: number, worldY: number): string | null {
    const active = this.getActiveRect();
    if (!active || active.locked) return null;
    const hx = active.x + active.width;
    const hy = active.y + active.height;
    const dx = worldX - hx;
    const dy = worldY - hy;
    return Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + HIT_TOLERANCE ? active.id : null;
  }

  destroy(): void {
    this.unsubscribe();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    destroyTree(this.container);
  }
}
