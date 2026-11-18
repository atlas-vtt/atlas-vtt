/** What the strip's buttons do to the shape under way. */
export interface OpenShapeControls {
  /** Ends the shape where it is, as Enter does. */
  finish(): void;
  /** Takes its last point back, as Backspace does. */
  back(): void;
}

/** What the strip shows of the shape under way. */
export interface OpenShapeState {
  /** Whether it can end as it is: a polygon needs an inside first. */
  readonly canFinish: boolean;
  /** Whether it has a point to take back. */
  readonly canGoBack: boolean;
}

/**
 * The shape a tool places point by point on a view while it waits for its next point (a line of
 * the Draw tool, a ruler, a fog polygon, a wall chain), as the UI knows it. A keyboard ends such
 * a shape with Enter and takes a point back with Backspace; a finger has neither key, so the
 * strip above the toolbar has a button for each (`OpenShapeStrip`). One per view (`openShapeOf`);
 * the tool whose shape it is tells it of every change, and one shape is under way at a time.
 */
export class OpenShape {
  private owner: object | null = null;
  private controls: OpenShapeControls | null = null;
  private current: OpenShapeState | null = null;
  private readonly listeners = new Set<() => void>();

  /** The shape under way; null while there is none. The same object until it changes. */
  get state(): OpenShapeState | null {
    return this.current;
  }

  /** Called by the tool `owner` when its shape began, and after every change of it. */
  show(owner: object, controls: OpenShapeControls, state: OpenShapeState): void {
    this.owner = owner;
    this.controls = controls;
    const before = this.current;
    if (before && before.canFinish === state.canFinish && before.canGoBack === state.canGoBack) return;
    this.current = { canFinish: state.canFinish, canGoBack: state.canGoBack };
    this.changed();
  }

  /** Called by the tool `owner` when its shape is over, however it ended; another tool's shape stays. */
  end(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.controls = null;
    if (!this.current) return;
    this.current = null;
    this.changed();
  }

  finish(): void {
    this.controls?.finish();
  }

  back(): void {
    this.controls?.back();
  }

  /** Calls `listener` after every change; returns the call that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

const shapes = new WeakMap<object, OpenShape>();

/** The open shape of the view whose store is `store`: its tools and its UI meet there. */
export function openShapeOf(store: object): OpenShape {
  let shape = shapes.get(store);
  if (!shape) shapes.set(store, shape = new OpenShape());
  return shape;
}

/** Marks what the strip is made of: a press there belongs to the shape under way, which a press anywhere else beside the map drops. */
export const OPEN_SHAPE_CONTROL = 'data-atlas-open-shape';

/** Whether a press on `target` is on one of the open shape's own buttons. */
export function isOpenShapeControl(target: EventTarget | null): boolean {
  return isElement(target) && target.closest(`[${OPEN_SHAPE_CONTROL}]`) !== null;
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null && 'closest' in target && typeof target.closest === 'function';
}
