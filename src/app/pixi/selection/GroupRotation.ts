import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasStore } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import { holdTokens } from '../../lighting/sightOnDrop';
import { mapTokens } from '../../tokens/offMap';
import { getDrawingBounds } from '../drawingGeometry';
import { tokenDiameterInCells } from '../token-renderer/tokenSizing';
import { GroupRotateButton } from './GroupRotateButton';
import { formationMiddle, pointerTurn, snapTurn, turnPoints, turnTokens, type Footprint, type Point, type TokenAtStart } from './groupTurn';
import type { Box } from './selectionGeometry';

/** What the tokens' renderer does for a group being turned. */
export interface GroupTurnHost {
  /** Where a group whose middle is `middle` turns about: on the scene's grid where it snaps (`gridPivot`), else its middle. */
  pivot(middle: Point): Point;
  /** Shows the tokens facing these ways while the turn lasts; null shows them as the store has them. */
  showFacings(facings: ReadonlyMap<string, number> | null): void;
}

/** The turn of the group frame: it turns about `centre` with the group and stops following what it holds. */
export interface FrameTurn {
  readonly centre: Point;
  readonly degrees: number;
}

export interface GroupRotationDeps {
  readonly viewport: Viewport;
  readonly store: ViewAtlasStore;
  host(): GroupTurnHost | null;
  /** The frame drawn around the group, in world units; null while none is. */
  frame(): Box | null;
  /** Holds the group frame turned, or lets it follow the group again. */
  turnFrame(turn: FrameTurn | null): void;
  /** Shows the selection again from what the canvas holds now. */
  refresh(): void;
  accent(): number;
  reducedMotion(): boolean;
}

interface Turn {
  readonly host: GroupTurnHost;
  readonly frame: Box;
  readonly centre: Point;
  readonly from: Point;
  readonly tokens: readonly TokenAtStart[];
  readonly drawings: ReadonlyArray<{ readonly id: string; readonly points: readonly Point[] }>;
  degrees: number;
  /** The pointer has turned the group: an undo step is open and the tokens are held. */
  started: boolean;
}

/**
 * Turns a selection of two or more as one rigid group from the button above its frame: every
 * token orbits the pivot and faces as much further round, drawings turn their points. The pivot is
 * the middle of the tokens' footprints and the drawings, put on the grid so that a quarter turn
 * (a sixth on hexes) lands a formation standing on cells on cells (`gridPivot`); other angles
 * leave it off the grid, as Owlbear Rodeo does. The angle snaps as a single token's does.
 * Releasing puts the tokens down where the turn showed them, through a drop (on top of the
 * others, sight worked out once), as one undo step;
 * Escape, a cancelled pointer and the window losing focus put everything back and leave none.
 */
export class GroupRotation {
  private readonly button: GroupRotateButton;
  private turn: Turn | null = null;
  private zoom = 1;
  /** Stops waiting for a load to finish before letting go of the tokens a dropped turn held. */
  private stopWaiting: (() => void) | null = null;

  constructor(private readonly deps: GroupRotationDeps) {
    this.button = new GroupRotateButton({
      accent: () => deps.accent(),
      gridSize: () => deps.store.getState().grid?.size || 70,
      reducedMotion: () => deps.reducedMotion(),
      press: (event) => this.press(event),
    });
  }

  /** The button's layer, which neither players nor thumbnails show. */
  get layer(): GroupRotateButton['layer'] {
    return this.button.layer;
  }

  /**
   * Shows the button above `frame` (world units) while the selection it holds can be turned:
   * `tokenIds` are the tokens it holds, `busy` says a marquee or lasso is being drawn.
   */
  follow(frame: Box | null, tokenIds: readonly string[], busy: boolean): void {
    this.zoom = this.deps.viewport.scale.x || 1;
    const turn = this.turn;
    if (turn) {
      this.button.show(turn.frame, this.zoom, turn.started ? { pivot: turn.centre, degrees: turn.degrees } : null);
      return;
    }
    const { isPlayerView, isDragging, activeTool } = this.deps.store.getState();
    const offered = !isPlayerView && !isDragging && !busy && tokenIds.length > 0 && (activeTool === 'select' || activeTool === 'move');
    this.button.show(offered ? frame : null, this.zoom);
  }

  /** Cancels a turn under way; whether there was one. */
  cancel(): boolean {
    if (!this.turn) return false;
    this.end(false);
    return true;
  }

  /**
   * Lets go of a turn under way without writing the scene: another scene has loaded, whose history was
   * cleared with the turn's open step. Only the held tokens are let go of, once the load is done.
   */
  drop(): void {
    const turn = this.turn;
    if (!turn) return;
    this.release(turn);
    turn.host.showFacings(null);
    this.settle();
    this.letGoAfterLoad(new Set(turn.tokens.map(({ id }) => id)));
  }

  destroy(): void {
    this.cancel();
    this.stopWaiting?.();
    this.button.destroy();
  }

  /**
   * Once the scene has loaded, the tokens the dropped turn held are held no longer, so sight on drop
   * keeps none of them where the turn took them (a reloaded scene has the same tokens). Pointer state
   * only: never saved, never an undo step. Others' held tokens stay held.
   */
  private letGoAfterLoad(turned: ReadonlySet<string>): void {
    const { store } = this.deps;
    const letGo = (): void => {
      this.stopWaiting = null;
      holdTokens(store, Object.keys(store.getState().heldTokens).filter((id) => !turned.has(id)));
    };
    this.stopWaiting?.();
    if (!store.getState().isMapLoading) {
      letGo();
      return;
    }
    const stop = store.subscribe((state) => {
      if (state.isMapLoading) return;
      stop();
      letGo();
    });
    this.stopWaiting = stop;
  }

  private press(event: FederatedPointerEvent): void {
    const { viewport, store } = this.deps;
    const host = this.deps.host();
    const frame = this.deps.frame();
    if (this.turn || !host || !frame) return;
    const { selectedIds, objects, grid } = store.getState();
    const tokens = mapTokens(objects);
    const footprints: Footprint[] = [];
    const starts = selectedIds.flatMap((id) => {
      const token = tokens[id];
      if (!token) return [];
      const across = (grid?.size || 70) * tokenDiameterInCells(token.size || 1);
      footprints.push({ x: token.x - across / 2, y: token.y - across / 2, width: across, height: across });
      return [{ id, x: token.x, y: token.y, rotation: token.rotation }];
    });
    if (starts.length === 0) return;
    const drawings = selectedIds.flatMap((id) => {
      const drawing = objects.drawings[id];
      const bounds = drawing ? getDrawingBounds(drawing) : null;
      if (!drawing || !bounds) return [];
      footprints.push(bounds);
      return [{ id, points: drawing.points.map(({ x, y }) => ({ x, y })) }];
    });
    const middle = formationMiddle(footprints);
    if (!middle) return;
    const centre = host.pivot(middle);
    this.turn = { host, frame, centre, from: viewport.toWorld(event.global), tokens: starts, drawings, degrees: 0, started: false };
    viewport.plugins.pause('drag');
    this.listen(true);
    this.button.setHeld(true);
  }

  private readonly onMove = (event: FederatedPointerEvent): void => {
    const turn = this.turn;
    // A scene loading writes the store in steps; the turn waits for it, and `drop` follows
    if (!turn || this.deps.store.getState().isMapLoading) return;
    const degrees = snapTurn(pointerTurn(turn.centre, turn.from, this.deps.viewport.toWorld(event.global)), event.shiftKey);
    if (degrees === turn.degrees) return;
    if (!turn.started) {
      turn.started = true;
      beginHistoryTransaction(this.deps.store);
      // Sight waits for the drop where the scene asks for it, as during a drag
      holdTokens(this.deps.store, turn.tokens.map(({ id }) => id));
    }
    turn.degrees = degrees;
    this.show(turn, degrees);
  };

  private readonly onRelease = (): void => {
    this.end(true);
  };

  private readonly onLost = (): void => {
    this.end(false);
  };

  /** The group as turned `degrees`: the tokens face round at once, their places and the drawings follow in the store. */
  private show(turn: Turn, degrees: number): void {
    const { store } = this.deps;
    // Before the store moves anything: the frame holds still from here, or it would frame the turned group anew
    this.deps.turnFrame({ centre: turn.centre, degrees });
    const turned = turnTokens(turn.tokens, turn.centre, degrees);
    turn.host.showFacings(new Map(turned.map(({ id, rotation }) => [id, rotation])));
    store.getState().setTokenPositions(turned.map(({ id, x, y }) => ({ id, x, y })));
    if (turn.drawings.length > 0) {
      store.getState().placeDrawings(Object.fromEntries(turn.drawings.map(({ id, points }) => [id, turnPoints(points, turn.centre, degrees)])));
    }
    this.button.show(turn.frame, this.zoom, { pivot: turn.centre, degrees });
  }

  /** Ends the turn: a release that turned the group puts it down as one undo step, anything else puts it back. */
  private end(commit: boolean): void {
    const turn = this.turn;
    if (!turn) return;
    if (this.deps.store.getState().isMapLoading) {
      this.drop();
      return;
    }
    this.release(turn);
    if (turn.started) {
      if (commit && turn.degrees !== 0) this.putDown(turn);
      else this.putBack(turn);
    }
    this.settle();
  }

  /** Stops following the pointer for `turn`. */
  private release(turn: Turn): void {
    if (this.turn === turn) this.turn = null;
    this.listen(false);
    this.deps.viewport.plugins.resume('drag');
    this.button.setHeld(false);
  }

  /** The frame follows the selection again and everything is shown as it now stands. */
  private settle(): void {
    this.deps.turnFrame(null);
    this.deps.refresh();
  }

  private putDown(turn: Turn): void {
    const { store } = this.deps;
    // Exactly where the turn showed them: the pivot keeps a clean turn on the grid
    store.getState().dropTokens(turnTokens(turn.tokens, turn.centre, turn.degrees));
    turn.host.showFacings(null);
    endHistoryTransaction(store);
  }

  private putBack(turn: Turn): void {
    const { store } = this.deps;
    turn.host.showFacings(null);
    store.getState().setTokenPositions(turn.tokens.map(({ id, x, y }) => ({ id, x, y })));
    if (turn.drawings.length > 0) store.getState().placeDrawings(Object.fromEntries(turn.drawings.map(({ id, points }) => [id, points])));
    holdTokens(store, []);
    abandonHistoryTransaction(store);
  }

  /** Follows the pointer on the viewport until it is let go, and a pointer or a window lost on the way. */
  private listen(on: boolean): void {
    const { viewport } = this.deps;
    const canvas = viewport.options?.events?.domElement;
    const win = canvas?.ownerDocument.defaultView;
    if (on) {
      viewport.on('pointermove', this.onMove);
      viewport.on('pointerup', this.onRelease);
      viewport.on('pointerupoutside', this.onRelease);
      canvas?.addEventListener('pointercancel', this.onLost);
      win?.addEventListener('blur', this.onLost);
      return;
    }
    viewport.off('pointermove', this.onMove);
    viewport.off('pointerup', this.onRelease);
    viewport.off('pointerupoutside', this.onRelease);
    canvas?.removeEventListener('pointercancel', this.onLost);
    win?.removeEventListener('blur', this.onLost);
  }
}
