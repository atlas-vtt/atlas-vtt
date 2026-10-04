import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../stores/history';
import { hitTestDrawing } from './drawingGeometry';
import { MAP_ICON_LABELS } from './mapIcons';
import { openContextMenuGlobal, type ContextMenuEntry } from '../react/root/ContextMenuContext';
import { addonObjectMenuEntries } from '../addons/addonHost';

/** Screen-space slack around ink, so thin lines stay grabbable at any zoom. */
const HIT_TOLERANCE_PX = 6;
/** World-space pointer travel before a press becomes a drag (matches token drags). */
const DRAG_THRESHOLD = 5;
/** Same inks the toolbar offers. */
const INK_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
];

/**
 * Selecting and dragging committed drawings with the select / move tools.
 * Pointer events arrive through the viewport-level dispatch in `TokenRenderer`.
 */
export class DrawingInteraction {
  private endDrag: (() => void) | null = null;

  constructor(
    private viewport: Viewport,
    private store: StoreApi<ViewAtlasState>
  ) {}

  /** Topmost drawing under a world-space point, or null. */
  public hitTest(worldX: number, worldY: number): string | null {
    // Drawings an add-on hides (e.g. not yet existing at the world date) cannot be picked
    const masked = this.store.getState().objectMask.hidden;
    const drawings = Object.values(this.store.getState().objects?.drawings ?? {}).filter((stroke) => !masked[stroke.id]);
    const tolerance = HIT_TOLERANCE_PX / this.viewport.scale.x;
    const point = { x: worldX, y: worldY };

    // Later drawings render on top, so test them first
    for (let i = drawings.length - 1; i >= 0; i--) {
      const stroke = drawings[i]!;
      if (hitTestDrawing(stroke, point, tolerance)) return stroke.id;
    }
    return null;
  }

  /** Left-click selects and drags a drawing; right-click opens its context menu. */
  public handleViewportPointerDown(drawingId: string, e: FederatedPointerEvent): void {
    const state = this.store.getState();
    if (state.isPlayerView) return;

    const selectedIds = state.selectedIds;
    const isSelected = selectedIds.includes(drawingId);

    if (e.button === 2) {
      if (!isSelected) state.setSelection([drawingId]);
      this.showContextMenu(drawingId, e);
      return;
    }
    if (e.button !== 0) return;

    if (e.shiftKey) {
      state.setSelection(isSelected ? selectedIds.filter((id) => id !== drawingId) : [...selectedIds, drawingId]);
    } else if (!isSelected) {
      state.setSelection([drawingId]);
    }

    this.startDrag(e);
  }

  /**
   * Drag every selected drawing along with the pointer. Also called when a
   * token-led group drag starts, so mixed selections move together; the nested
   * history transactions collapse into one undo step.
   */
  public startDrag(e: FederatedPointerEvent): void {
    this.endDrag?.();

    const initial = this.store.getState();
    if (initial.isPlayerView) return;
    const dragIds = initial.selectedIds.filter((id) => initial.objects.drawings[id]);
    if (dragIds.length === 0) return;

    const start = this.viewport.toWorld(e.global);
    let applied = { x: 0, y: 0 };
    let isDragging = false;

    const onPointerMove = (moveEvent: FederatedPointerEvent): void => {
      const world = this.viewport.toWorld(moveEvent.global);
      const dx = world.x - start.x;
      const dy = world.y - start.y;

      if (!isDragging) {
        if (dx * dx + dy * dy <= DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        isDragging = true;
        this.viewport.plugins.pause('drag');
        beginHistoryTransaction(this.store);
      }

      this.store.getState().moveDrawings(dragIds, dx - applied.x, dy - applied.y);
      applied = { x: dx, y: dy };
    };

    const endDrag = (): void => {
      this.viewport.off('pointermove', onPointerMove);
      this.viewport.off('pointerup', endDrag);
      this.viewport.off('pointerupoutside', endDrag);
      this.endDrag = null;
      if (!isDragging) return;
      endHistoryTransaction(this.store);
      this.viewport.plugins.resume('drag');
    };

    this.endDrag = endDrag;
    this.viewport.on('pointermove', onPointerMove);
    this.viewport.on('pointerup', endDrag);
    this.viewport.on('pointerupoutside', endDrag);
  }

  /** Menu actions apply to every selected drawing, so a group can be restyled at once. */
  private showContextMenu(drawingId: string, e: FederatedPointerEvent): void {
    const { selectedIds, objects } = this.store.getState();
    const ids = selectedIds.filter((id) => objects.drawings[id]);
    const clicked = objects.drawings[drawingId];
    if (!clicked || ids.length === 0) return;

    const entries: ContextMenuEntry[] = [
      {
        type: 'submenu',
        label: 'Color',
        icon: 'palette',
        children: INK_COLORS.map(({ label, value }) => ({
          type: 'item' as const,
          label,
          checked: clicked.color === value,
          onClick: () => this.store.getState().updateDrawings(ids, { color: value }),
        })),
      },
    ];

    const iconIds = ids.filter((id) => objects.drawings[id]?.type === 'icon');
    if (clicked.type === 'icon') {
      entries.push({
        type: 'submenu',
        label: 'Change Icon',
        icon: 'shapes',
        children: Object.entries(MAP_ICON_LABELS).map(([icon, label]) => ({
          type: 'item' as const,
          label,
          checked: clicked.icon === icon,
          onClick: () => this.store.getState().updateDrawings(iconIds, { icon }),
        })),
      });
    }

    entries.push(
      ...addonObjectMenuEntries(this.store, 'drawing', drawingId),
      { type: 'item', label: 'Duplicate', icon: 'files', onClick: () => this.store.getState().duplicateMapObjects(ids) },
      { type: 'item', label: 'Delete', icon: 'trash', destructive: true, onClick: () => this.store.getState().deleteSelected() },
    );

    const original = e.originalEvent as unknown;
    const position = original instanceof MouseEvent
      ? { x: original.clientX, y: original.clientY }
      : { x: e.global.x, y: e.global.y };
    openContextMenuGlobal(entries, position);
  }

  public destroy(): void {
    this.endDrag?.();
  }
}
