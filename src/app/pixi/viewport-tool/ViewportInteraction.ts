import type { StoreApi } from 'zustand';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { ViewAtlasState } from '../../storeFactory';
import type { ViewportRectRenderer } from './ViewportRectRenderer';

type DragKind = 'body' | 'handle';

/**
 * Owns drag state for repositioning (body drag, either lock state) and
 * uniform-scale resizing (handle drag, unlocked only) of the active TV
 * viewport rect. Hit-testing comes from ViewportRectRenderer; commits go
 * through the store, and a whole drag is one undo step, as in WallInteraction.
 */
export class ViewportInteraction {
  private readonly store: StoreApi<ViewAtlasState>;
  private readonly renderer: ViewportRectRenderer;

  private draggingId: string | null = null;
  private dragKind: DragKind | null = null;
  private dragStartWorld: { x: number; y: number } = { x: 0, y: 0 };
  private dragStartRect: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 0, height: 0 };

  constructor(store: StoreApi<ViewAtlasState>, renderer: ViewportRectRenderer) {
    this.store = store;
    this.renderer = renderer;
  }

  isDragging(): boolean {
    return this.draggingId !== null;
  }

  /** Returns true if the pointer-down was consumed (started a drag). */
  handlePointerDown(worldX: number, worldY: number): boolean {
    const handleId = this.renderer.hitTestHandle(worldX, worldY);
    if (handleId) {
      const rect = this.store.getState().objects.viewports[handleId];
      if (!rect) return false;
      this.draggingId = handleId;
      this.dragKind = 'handle';
      this.dragStartWorld = { x: worldX, y: worldY };
      this.dragStartRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      beginHistoryTransaction(this.store);
      return true;
    }

    const bodyId = this.renderer.hitTestBody(worldX, worldY);
    if (bodyId) {
      const rect = this.store.getState().objects.viewports[bodyId];
      if (!rect) return false;
      this.draggingId = bodyId;
      this.dragKind = 'body';
      this.dragStartWorld = { x: worldX, y: worldY };
      this.dragStartRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      beginHistoryTransaction(this.store);
      return true;
    }

    return false;
  }

  handlePointerMove(worldX: number, worldY: number): void {
    if (!this.draggingId || !this.dragKind) return;
    const dx = worldX - this.dragStartWorld.x;
    const dy = worldY - this.dragStartWorld.y;

    if (this.dragKind === 'body') {
      this.store.getState().updateViewport(this.draggingId, {
        x: this.dragStartRect.x + dx,
        y: this.dragStartRect.y + dy,
      });
      return;
    }

    // Handle drag: uniform scale from top-left, width leads, aspect ratio preserved.
    const aspectRatio = this.dragStartRect.width / this.dragStartRect.height;
    const minWidth = 20;
    const newWidth = Math.max(minWidth, this.dragStartRect.width + dx);
    const newHeight = newWidth / aspectRatio;
    this.store.getState().updateViewport(this.draggingId, { width: newWidth, height: newHeight });
  }

  handlePointerUp(): void {
    if (this.draggingId) endHistoryTransaction(this.store);
    this.draggingId = null;
    this.dragKind = null;
  }

  cursorAt(worldX: number, worldY: number): string {
    if (this.renderer.hitTestHandle(worldX, worldY)) return 'nwse-resize';
    if (this.renderer.hitTestBody(worldX, worldY)) return 'grab';
    return 'crosshair';
  }
}
