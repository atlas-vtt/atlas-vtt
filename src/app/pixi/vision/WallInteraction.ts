import { wallList } from '../../vision/wallList';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction, runHistoryTransaction } from '../../stores/history';
import type { WallRenderer } from './WallRenderer';
import type { Point } from '../../types/visionTypes';
import type { WallSegment, WallType } from '../../types/wallTypes';
import { endsAt, snapToWallEnd, type WallEnd } from '../lighting/wallEnds';
import type { WallEdit } from '../lighting/wallJoints';
import { levelObjects } from '../../levels/levelObjects';

/** Screen pixels a pressed wall end must travel before it follows the pointer: less is a click. */
const DRAG_THRESHOLD = 3;

/** A joint held by the pointer: every wall end there moves as one. */
interface JointDrag {
  joint: Point;
  pressedAt: Point;
  ends: WallEnd[];
  /** The other ends of the joint's walls, which stay where they are. */
  farEnds: Point[];
  /** The joint has followed the pointer; its history transaction is open. */
  moved: boolean;
  /** Pressed without adding to the selection, so a release in place is a click on the joint. */
  plain: boolean;
}

/**
 * Handles wall interaction: multi-selection, joint dragging, door toggling, bulk type changes
 * and deletion. Lights join the selection through `selectLight` (their markers take the pointer
 * themselves, see `LightInteraction`).
 *
 * Multi-select: Ctrl/Cmd+click toggles a wall chain in/out of the selection.
 * Plain click replaces the selection with the clicked chain.
 */
export class WallInteraction {
  private store: StoreApi<ViewAtlasState>;
  private wallRenderer: WallRenderer;
  private drag: JointDrag | null = null;
  private selectedWallIds: Set<string> = new Set();
  private selectedLightIds: Set<string> = new Set();

  /** `onLightSelection` shows which lights are selected, on their markers. */
  constructor(store: StoreApi<ViewAtlasState>, wallRenderer: WallRenderer, private readonly onLightSelection: (lightIds: string[]) => void = () => undefined) {
    this.store = store;
    this.wallRenderer = wallRenderer;
  }

  /** Handle pointer down. Returns true if something was hit. */
  handlePointerDown(worldX: number, worldY: number, addToSelection: boolean = false): boolean {
    // 1. Check vertex handles first (for dragging)
    const vertexHit = this.wallRenderer.hitTestVertices(worldX, worldY);
    if (vertexHit) {
      this.selectWallChain(vertexHit.wallId, addToSelection);
      this.holdJoint(vertexHit.wallId, vertexHit.vertex, { x: worldX, y: worldY }, !addToSelection);
      return true;
    }

    // 2. Check walls
    const wallId = this.wallRenderer.hitTestWalls(worldX, worldY);
    if (wallId) {
      this.selectWallChain(wallId, addToSelection);
      // Toggle door on plain click (not multi-select)
      if (!addToSelection) {
        const wall = levelObjects(this.store.getState()).walls[wallId];
        if (wall && (wall.type === 'door' || wall.type === 'secret-door')) {
          this.store.getState().toggleDoor(wallId);
        }
      }
      return true;
    }

    // Clicked on nothing — clear unless adding to selection
    if (!addToSelection) {
      this.clearSelection();
    }
    return false;
  }

  /** A held joint follows the pointer once it has left the click's reach, landing on a wall end close by unless `free` (Alt). */
  handlePointerMove(worldX: number, worldY: number, free: boolean = false): void {
    const drag = this.drag;
    if (!drag) return;
    const zoom = this.wallRenderer.zoom;
    if (!drag.moved && Math.hypot(worldX - drag.pressedAt.x, worldY - drag.pressedAt.y) < DRAG_THRESHOLD / zoom) return;
    if (!drag.moved) {
      // Live drag writes hit the store on every move; the transaction folds them into one undo step.
      drag.moved = true;
      beginHistoryTransaction(this.store);
    }
    const state = this.store.getState();
    const point = { x: worldX, y: worldY };
    // Never onto the far end of a wall that moves with it, which would shrink that wall to a point.
    const to = free ? point : snapToWallEnd(point, levelObjects(state).walls, zoom, { skip: new Set(drag.ends.map((end) => end.wallId)), avoid: drag.farEnds });
    for (const end of drag.ends) state.updateWall(end.wallId, { [end.end]: to });
  }

  /** Ends a drag. Returns the joint when it was clicked, pressed and released in place without adding to the selection. */
  handlePointerUp(): Point | null {
    const drag = this.drag;
    this.endDrag();
    return drag && !drag.moved && drag.plain ? drag.joint : null;
  }

  private endDrag(): void {
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved) endHistoryTransaction(this.store);
  }

  // ─── Bulk Operations ─────────────────────────────────────────────────

  /** Delete all selected walls and lights. */
  deleteSelected(): void {
    runHistoryTransaction(this.store, () => this.deleteSelection());
  }

  private deleteSelection(): void {
    this.keepShownSelection();
    if (this.selectedWallIds.size > 0) {
      this.store.getState().deleteWalls(Array.from(this.selectedWallIds));
      this.selectedWallIds.clear();
      this.wallRenderer.setSelectedWalls([]);
    }
    if (this.selectedLightIds.size > 0) {
      for (const id of this.selectedLightIds) {
        this.store.getState().deleteLight(id);
      }
      this.selectedLightIds.clear();
      this.onLightSelection([]);
    }
  }

  /** Applies an edit of whole walls as one undo step, and clears the selection. */
  apply(edit: WallEdit): void {
    const state = this.store.getState();
    runHistoryTransaction(this.store, () => {
      if (edit.remove.length > 0) state.deleteWalls(edit.remove);
      for (const wall of edit.add) state.addWall(wall);
    });
    this.clearSelection();
  }

  /** Change the type of all selected walls. */
  changeSelectedWallType(type: WallType): void {
    this.keepShownSelection();
    const state = this.store.getState();
    runHistoryTransaction(this.store, () => this.selectedWallIds.forEach((id) => {
      const updates: Record<string, unknown> = { type };
      if (type === 'door' || type === 'secret-door') {
        const wall = levelObjects(state).walls[id];
        if (wall && wall.closed === undefined) {
          updates.closed = true;
        }
      }
      state.updateWall(id, updates);
    }));
    this.wallRenderer.forceRedraw();
  }

  /** Changes all selected walls alike, as one undo step: the side they let light through, what they block, whether they are limited. */
  updateSelected(changes: Partial<Pick<WallSegment, 'direction' | 'blocks' | 'limited'>>): void {
    this.keepShownSelection();
    const state = this.store.getState();
    runHistoryTransaction(this.store, () => this.selectedWallIds.forEach((id) => state.updateWall(id, changes)));
    this.wallRenderer.forceRedraw();
  }

  // ─── Getters ──────────────────────────────────────────────────────

  getSelectedWallIds(): string[] {
    this.keepShownSelection();
    return Array.from(this.selectedWallIds);
  }

  getSelectedLightIds(): string[] {
    this.keepShownSelection();
    return Array.from(this.selectedLightIds);
  }

  hasSelection(): boolean {
    this.keepShownSelection();
    return this.selectedWallIds.size > 0 || this.selectedLightIds.size > 0;
  }

  /** A joint is held by the pointer, moved or not yet. */
  isDragging(): boolean {
    return this.drag !== null;
  }

  // ─── Selection Logic ─────────────────────────────────────────────────

  /**
   * Select a wall chain. With addToSelection, toggles the chain in/out.
   * Without it, replaces the selection.
   */
  selectWallChain(wallId: string, addToSelection: boolean): void {
    const walls = levelObjects(this.store.getState()).walls;
    const wall = walls[wallId];
    if (!wall) return;

    // Resolve chain IDs
    const chainId = wall.chainId;
    const chainIds: string[] = chainId
      ? wallList(walls).filter(w => w.chainId === chainId).map(w => w.id)
      : [wallId];

    if (addToSelection) {
      // Toggle: if the chain is already fully selected, deselect it; otherwise add it
      const allSelected = chainIds.every(id => this.selectedWallIds.has(id));
      if (allSelected) {
        for (const id of chainIds) this.selectedWallIds.delete(id);
      } else {
        for (const id of chainIds) this.selectedWallIds.add(id);
      }
    } else {
      // Replace selection with this chain
      this.selectedWallIds = new Set(chainIds);
      this.selectedLightIds.clear();
    }

    this.syncRendererSelection();
  }

  /** Selects one wall alone, not its chain: the wall a door is placed in. */
  selectSegment(wallId: string): void {
    this.selectedWallIds = new Set([wallId]);
    this.selectedLightIds.clear();
    this.syncRendererSelection();
  }

  /** Selects a light; with `addToSelection` toggles it in or out. */
  selectLight(lightId: string, addToSelection: boolean): void {
    if (addToSelection) {
      if (this.selectedLightIds.has(lightId)) {
        this.selectedLightIds.delete(lightId);
      } else {
        this.selectedLightIds.add(lightId);
      }
    } else {
      this.selectedLightIds = new Set([lightId]);
      this.selectedWallIds.clear();
    }

    this.syncRendererSelection();
  }

  /**
   * Lets go of the selected walls and lights the floor shown does not hold: those of a floor the GM
   * left, or deleted. No edit of the selection reaches what the GM cannot see.
   */
  private keepShownSelection(): void {
    const { walls, lights } = levelObjects(this.store.getState());
    let changed = false;
    for (const id of this.selectedWallIds) {
      if (walls[id]) continue;
      this.selectedWallIds.delete(id);
      changed = true;
    }
    for (const id of this.selectedLightIds) {
      if (lights[id]) continue;
      this.selectedLightIds.delete(id);
      changed = true;
    }
    if (changed) this.syncRendererSelection();
  }

  clearSelection(): void {
    this.selectedWallIds.clear();
    this.selectedLightIds.clear();
    this.syncRendererSelection();
  }

  private syncRendererSelection(): void {
    this.wallRenderer.setSelectedWalls(Array.from(this.selectedWallIds));
    this.onLightSelection(Array.from(this.selectedLightIds));
  }

  private holdJoint(wallId: string, vertex: 'p1' | 'p2', pressedAt: Point, plain: boolean): void {
    const walls = levelObjects(this.store.getState()).walls;
    const wall = walls[wallId];
    if (!wall) return;
    this.endDrag();
    const joint = { ...wall[vertex] };
    const ends = endsAt(joint, walls);
    const farEnds = ends.flatMap((end) => walls[end.wallId]?.[end.end === 'p1' ? 'p2' : 'p1'] ?? []);
    this.drag = { joint, pressedAt, ends, farEnds, moved: false, plain };
  }

  destroy(): void {
    this.endDrag();
  }
}
