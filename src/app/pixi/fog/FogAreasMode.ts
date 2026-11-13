/**
 * The fog tool's Areas mode: what a press does there. On the selected area it edits that area
 * (`FogAreaEditor`); released in place it is a click, which selects the area under it or lets go
 * of the selection; moved, it begins the shape chosen, which becomes an area (`FogAreaStroke`).
 * So a press is a shape only once the pointer has left the place it was pressed at.
 */
import type { Container } from 'pixi.js';
import { makesFogAreas } from '../../fog/fogToolChoices';
import type { Point } from '../../types/visionTypes';
import type { LayerVisibility } from '../playerSafeFrame';
import { CLICK_SLOP, FogAreaEditor, type FogAreaEditorDeps } from './FogAreaEditor';
import { FogAreaStroke } from './FogAreaStroke';
import type { PlaceKeys } from './FogSnapping';
import type { FogStrokeHost } from './fogStrokeOutcome';

/** What the mode asks of the fog tool's gesture. */
export interface FogAreasHost {
  /** Begins the shape chosen at a place: a drag, or a polygon's first corner. */
  begin(world: Point, screen: Point, keys: PlaceKeys): void;
  /** A click in place that selected no area: where the shape chosen is placed by clicks, it is one (a polygon's corner, the room clicked in). */
  click(world: Point, screen: Point, keys: PlaceKeys): void;
  /** The pointer is on a handle: what showed where a shape would begin goes. */
  rest(): void;
}

export interface FogAreasModeDeps extends FogAreaEditorDeps {
  /** The fog's layer, which the handles and the outlines of a stroke under way join. */
  readonly layer: Container;
  readonly picture: FogStrokeHost;
  readonly host: FogAreasHost;
}

/** A press of the primary button, as it was made. */
interface Press {
  readonly world: Point;
  readonly screen: Point;
  readonly keys: PlaceKeys;
  readonly alt: boolean;
}

export class FogAreasMode {
  /** What a shape drawn in the mode leaves. */
  readonly stroke: FogAreaStroke;
  readonly editor: FogAreaEditor;
  /** The press under way. */
  private pressed: Press | null = null;
  /** The press under way took nothing yet: it is a click, or a shape once the pointer moves. */
  private waiting = false;
  /** The pointer is on a handle of the selected area. */
  private onHandle = false;

  constructor(private readonly deps: FogAreasModeDeps) {
    this.stroke = new FogAreaStroke(deps.store, deps.picture, () => deps.viewport.scale.x);
    this.editor = new FogAreaEditor(deps);
    // Beside the outline of a stroke under way, below the ring and the guide.
    this.stroke.view.zIndex = 1001;
    this.editor.view.zIndex = 1001;
    deps.layer.addChild(this.stroke.view, this.editor.view);
  }

  /** The fog tool is in use and makes areas. */
  get on(): boolean {
    return makesFogAreas(this.deps.store.getState());
  }

  /** A press of the primary button that no shape under way takes. */
  press(world: Point, screen: Point, keys: PlaceKeys, alt: boolean): void {
    this.pressed = { world, screen, keys, alt };
    this.waiting = !this.editor.press(world, screen, alt);
  }

  /**
   * The pointer moved while no shape is under way. True where the move is the mode's own: the
   * selected area is dragged, a press has not left its place yet, or the pointer is on a handle.
   * A press that leaves its place begins the shape there, and the move is the shape's.
   */
  move(world: Point, screen: Point, keys: PlaceKeys): boolean {
    if (this.editor.move(world, screen, keys)) return true;
    const press = this.waiting ? this.pressed : null;
    if (press) {
      if (Math.hypot(screen.x - press.screen.x, screen.y - press.screen.y) < CLICK_SLOP) return true;
      this.waiting = false;
      this.deps.host.begin(press.world, press.screen, press.keys);
      return false;
    }
    const onHandle = this.editor.hover(world);
    if (onHandle && !this.onHandle) this.deps.host.rest();
    this.onHandle = onHandle;
    return onHandle;
  }

  /**
   * The pointer was released. True where that ended something of the mode's: a drag of the
   * selected area, or a click, which selects the area under it (none: lets go of the selection)
   * and, where the shape is placed by clicks, is one of them unless the click selected.
   */
  release(): boolean {
    const ended = this.editor.release();
    const press = this.pressed;
    const waited = this.waiting;
    this.pressed = null;
    this.waiting = false;
    if (ended === 'done') return true;
    if (!press || (ended === 'none' && !waited)) return false;
    if (ended === 'none') {
      const under = this.editor.areaAt(press.world);
      // Alt begins a shape that takes away, also inside an area.
      if (under !== null && !press.alt && this.editor.editable) {
        this.editor.select(under);
        return true;
      }
      if (under === null) this.editor.select(null);
    }
    this.deps.host.click(press.world, press.screen, press.keys);
    return true;
  }

  /** Ends what is under way without a trace: a drag of the selected area, a press, a stroke's outlines. */
  cancel(): void {
    this.editor.cancel();
    this.stroke.end();
    this.pressed = null;
    this.waiting = false;
  }

  /** The map was zoomed. */
  rescale(): void {
    this.stroke.rescale();
  }

  /** The canvas shows another view. */
  refresh(): void {
    this.editor.refresh();
  }

  /** The GM's alone, hidden in every picture of the scene: the handles, and the outlines of a stroke under way. */
  layers(): LayerVisibility[] {
    return [this.stroke.view, this.editor.view].map((layer) => ({ layer, visible: false }));
  }

  destroy(): void {
    this.editor.destroy();
    this.stroke.destroy();
  }
}
