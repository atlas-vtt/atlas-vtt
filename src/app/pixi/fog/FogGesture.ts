/**
 * The fog tool's gesture: what the pointer does on the map while the tool is chosen. A press is
 * routed by the shape and the mode the bar has chosen: a drag, a polygon's corner or a click in
 * a room, which are the stroke's to draw, show and commit (`FogStroke`), or in Areas mode a
 * press that selects and edits areas before it is a shape (`FogAreasMode`).
 */
import type * as PIXI from 'pixi.js';
import type { Point } from '../../types/visionTypes';
import { isFogTool, type FogShape, type FogToolChoices } from '../../fog/fogToolChoices';
import type { LayerVisibility } from '../playerSafeFrame';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';
import { FogAreasMode } from './FogAreasMode';
import { placeKeysOf, type PlaceKeys } from './FogSnapping';
import { FogStroke, type FogStrokeDeps } from './FogStroke';

export interface FogGestureDeps extends FogStrokeDeps {
  /** Whether the canvas shows the players' view though the store's view switches say the GM's (a peek). */
  readonly showsPlayers?: () => boolean | null;
}

export class FogGesture {
  /** The shape the bar has chosen. */
  private shape: FogShape;
  /** Whether the bar has the tool make areas. */
  private makesAreas: boolean;
  private readonly stroke: FogStroke;
  private readonly areas: FogAreasMode;
  /** Where the pointer is on the canvas; null once it has left it. */
  private over: PIXI.PointData | null = null;

  private readonly onPointerDown = (event: PIXI.FederatedPointerEvent): void => this.pointerDown(event);
  private readonly onPointerMove = (event: PIXI.FederatedPointerEvent): void => this.pointerMove(event);
  private readonly onPointerUp = (): void => this.pointerUp();
  private readonly onPointerLeave = (): void => this.pointerLeave();
  private readonly onZoomed = (): void => {
    this.stroke.rescale();
    this.areas.rescale();
  };

  constructor(private readonly deps: FogGestureDeps) {
    const { layer, viewport, store } = deps;
    this.stroke = new FogStroke(deps, () => this.areas);
    this.areas = new FogAreasMode({
      layer, viewport, canvas: deps.canvas, store, snapping: this.stroke.snapping, picture: deps.host,
      busy: () => this.active,
      ...(deps.keysBelongToMap && { keysBelongToMap: deps.keysBelongToMap }),
      ...(deps.showsPlayers && { showsPlayers: deps.showsPlayers }),
      host: {
        begin: (world, screen, keys) => this.begin(world, screen, keys),
        click: (world, screen, keys) => this.click(world, screen, keys),
        rest: () => this.rest(),
      },
    });

    const { fogTool } = store.getState();
    this.shape = fogTool.shape;
    this.makesAreas = fogTool.areas;
    this.stroke.setBrushSize(fogTool.brushSize);

    viewport.on('pointerdown', this.onPointerDown);
    viewport.on('pointermove', this.onPointerMove);
    viewport.on('pointerup', this.onPointerUp);
    viewport.on('pointerupoutside', this.onPointerUp);
    viewport.on('zoomed', this.onZoomed);
    // The ring goes when the pointer leaves the canvas.
    deps.canvas().addEventListener('pointerleave', this.onPointerLeave);
  }

  /** A gesture is under way: its preview is on the fog's canvas. */
  get active(): boolean {
    return this.stroke.active;
  }

  /** The fog tool was taken up, or changed between hiding and revealing: the brush shows its ring under the pointer, and what is under way what it now does. */
  start(): void {
    if (this.shape === 'brush') this.ringAtPointer();
    this.refresh();
  }

  /** Another tool was taken up: what is under way goes without a trace, and the ring with it. */
  stop(): void {
    this.cancel();
    this.stroke.hideRing();
  }

  /** Ends what is under way without committing it; the picture is the caller's to draw. */
  cancel(): void {
    this.stroke.cancel();
  }

  /** Drops what is under way, leaving the fog as the store holds it. */
  drop(): void {
    this.stroke.drop();
  }

  /** The fog under a gesture changed, or what the gesture does: its preview is drawn again. */
  refresh(): void {
    this.stroke.refresh();
  }

  /** The tool's choices changed in its bar or by a key: the brush takes its size, and another shape, or areas in place of fog, drops what is under way. */
  follow(choices: FogToolChoices): void {
    this.stroke.setBrushSize(choices.brushSize);
    if (choices.shape === this.shape && choices.areas === this.makesAreas) return;
    this.drop();
    this.shape = choices.shape;
    this.makesAreas = choices.areas;
    if (isFogTool(this.deps.store.getState().activeTool) && this.shape === 'brush') this.ringAtPointer();
    else this.stroke.hideRing();
  }

  /** The gesture hears presses after the dispatch that claims them; called once that dispatch listens. */
  hearPressesLast(): void {
    hearPressesLast(this.deps.viewport, this.onPointerDown);
  }

  /**
   * The canvas shows another view (the GM's, or the players'): a selected area is the GM's
   * alone, and so are the ring, the outline and the guide, which a peek hides for as long as it lasts.
   */
  refreshVisibility(): void {
    this.areas.refresh();
    this.stroke.showMarks(!this.peeking());
  }

  /** The cursor at a world point where a press would take the selected area (a corner, its inside); null elsewhere, and while a shape is under way. */
  cursorAt(world: Point): string | null {
    return this.active ? null : this.areas.editor.cursorAt(world);
  }

  /** What is the GM's alone: the ring, the outline of what is under way, the snapping guide and what Areas mode shows. */
  playerLayers(): LayerVisibility[] {
    return [...this.stroke.layers(), ...this.areaLayers()];
  }

  /** What Areas mode shows on the map: the selected area's handles, the outlines a stroke will leave. No picture of the scene has them. */
  areaLayers(): LayerVisibility[] {
    return this.areas.layers();
  }

  /** Nothing would begin where the pointer is, or what would has changed (the walls): the guide and the outline of the cell or room under it go. */
  rest(): void {
    this.stroke.rest();
  }

  destroy(): void {
    const { viewport, canvas } = this.deps;
    viewport.off('pointerdown', this.onPointerDown);
    viewport.off('pointermove', this.onPointerMove);
    viewport.off('pointerup', this.onPointerUp);
    viewport.off('pointerupoutside', this.onPointerUp);
    viewport.off('zoomed', this.onZoomed);
    canvas().removeEventListener('pointerleave', this.onPointerLeave);
    // The mode's own cancelling clears the guide, which is the stroke's.
    this.areas.destroy();
    this.stroke.destroy();
  }

  /**
   * Shows the brush's ring where the pointer is on the map. While the pointer is elsewhere (on the
   * bar that chose the brush) there is none: it would stand where the pointer last was.
   */
  private ringAtPointer(): void {
    if (this.over) this.stroke.showRingAt(this.worldOf(this.over));
  }

  /** The canvas shows the players' picture for a moment (the peek key is held) while the view stays the GM's. */
  private peeking(): boolean {
    const { isGMView, isPlayerView } = this.deps.store.getState();
    return isGMView && isPlayerView !== true && this.deps.showsPlayers?.() === true;
  }

  private pointerDown(event: PIXI.FederatedPointerEvent): void {
    const state = this.deps.store.getState();
    if (!isFogTool(state.activeTool)) return;
    // Only the primary button draws; the right button pans the map.
    if (!isPrimaryPress(event)) return;
    // A press a pin, door badge or light marker took draws no fog.
    if (isHandled(event)) return;

    this.stroke.setFlipped(event.altKey === true);
    const screen = { x: event.global.x, y: event.global.y };
    const world = this.worldOf(screen);
    const keys = placeKeysOf(event);
    this.over = screen;
    this.stroke.pointer = world;
    // In Areas mode a press is a shape only once the pointer moves: in place it selects.
    if (this.areas.on && !this.stroke.polygon.active) this.areas.press(world, screen, keys, this.stroke.altHeld);
    else this.begin(world, screen, keys);
  }

  /** Begins the shape chosen at `world`, or places the next corner of the polygon under way. A room is no shape until the press is released in place. */
  private begin(world: Point, screen: Point, keys: PlaceKeys): void {
    if (this.shape !== 'room') this.stroke.begin(this.shape, world, screen, keys);
    else if (!this.areas.on) this.stroke.pressRoom(screen);
  }

  private pointerMove(event: PIXI.FederatedPointerEvent): void {
    const fogTool = isFogTool(this.deps.store.getState().activeTool);
    // Alt pressed or let go while the map had no key focus is told by the pointer.
    if (fogTool) this.stroke.setFlipped(event.altKey === true);
    const screen = { x: event.global.x, y: event.global.y };
    const world = this.worldOf(screen);
    const keys = placeKeysOf(event);
    this.over = screen;

    // Areas mode: a drag of the selected area, a press that is no shape yet, a handle under the pointer.
    if (fogTool && !this.active && this.areas.on && this.areas.move(world, screen, keys)) {
      this.stroke.pointer = world;
      return;
    }

    if (this.shape === 'brush' && fogTool) this.stroke.moveRing(world);

    if (this.stroke.drag.active) this.stroke.extend(world, keys);
    // Before a press, the guide shows where a first corner would land, and Cells the cell under the pointer.
    else if (fogTool) this.stroke.hover(this.shape, world, screen, keys);
  }

  /** The pointer left the map's canvas: the brush's ring, the guide and the cell under the pointer would stay where they last were. */
  private pointerLeave(): void {
    this.over = null;
    this.stroke.hideRing();
    if (!this.active) this.rest();
  }

  private pointerUp(): void {
    if (!this.active && this.areas.release()) return;
    this.stroke.release();
  }

  /** A click in Areas mode that selected no area: a polygon's first corner, or the room clicked in. */
  private click(world: Point, screen: Point, keys: PlaceKeys): void {
    if (this.shape === 'polygon') this.begin(world, screen, keys);
    else if (this.shape === 'room') this.stroke.clickRoom(world);
  }

  private worldOf(screen: PIXI.PointData): Point {
    const { x, y } = this.deps.viewport.toWorld(screen);
    return { x, y };
  }
}
