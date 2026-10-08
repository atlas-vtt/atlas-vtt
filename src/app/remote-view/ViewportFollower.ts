/**
 * Moves a remote view's pixi-viewport where its owner asks (`setCamera`), gliding there or at
 * once, and fits the map for Fit map. The viewport's own drag, wheel and pinch plugins move it
 * too: their `moved` events mean the player moved the camera themselves, which ends the glide and
 * the goal, so a drag in progress is never reset under the player. Moves made here (`setZoom`,
 * then `moveCenter`) emit no `moved` event. Whether to follow someone stays the owner's decision.
 */
import type { ViewCamera } from '../services/presentedCamera';

/** The `moved` events pixi-viewport emits for the player's own moves. */
export const PLAYER_MOVES: ReadonlySet<string> = new Set(['drag', 'wheel', 'pinch', 'decelerate']);
/** How long the view takes to glide to a camera. */
export const GLIDE_MS = 150;
/** Space left around the map when it is fitted (Fit map, Shift+1), and around a padded camera, in screen pixels. */
export const FIT_PADDING = 16;
/** The zoom a camera may ask for, as screen pixels per world unit. */
export const MIN_ZOOM = 1 / 64;
export const MAX_ZOOM = 64;

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The zoom that shows `area` as large as fits `screen` with `padding` screen pixels left on each side, within the limits. */
function fittingZoom(screen: { width: number; height: number }, area: { width: number; height: number }, padding: number): number {
  const width = Math.max(1, screen.width - 2 * padding) / Math.max(1e-6, area.width);
  const height = Math.max(1, screen.height - 2 * padding) / Math.max(1e-6, area.height);
  return clampZoom(Math.min(width, height));
}

/** The part of pixi-viewport's `Viewport` the follower uses. */
export interface FollowViewport {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly center: { x: number; y: number };
  readonly scale: { x: number };
  setZoom(scale: number): unknown;
  moveCenter(x: number, y: number): unknown;
  on(event: 'moved', listener: (event: { type: string }) => void): unknown;
  off(event: 'moved', listener: (event: { type: string }) => void): unknown;
}

export interface Frames {
  request(draw: () => void): number;
  cancel(handle: number): void;
}

/**
 * Animation frames of the window `windowOf` names when a frame is asked for: a view moved into a popout animates on
 * that window's clock. The follower has one frame at a time, so it is cancelled on the window that gave it.
 */
export function framesIn(windowOf: () => Window): Frames {
  let requestedIn: Window = window;
  return {
    request: (draw) => {
      requestedIn = windowOf();
      return requestedIn.requestAnimationFrame(() => draw());
    },
    cancel: (handle) => requestedIn.cancelAnimationFrame(handle),
  };
}

export const ANIMATION_FRAMES: Frames = framesIn(() => window);

interface Pose { centerX: number; centerY: number; zoom: number }
/** What the camera keeps showing through resizes: a world area, or the whole map. */
type Goal = { kind: 'view'; view: ViewCamera; padded: boolean } | { kind: 'fit' };

export interface ViewportFollowerOptions {
  viewport: FollowViewport;
  /** The map's size in world units; null while there is none. */
  mapSize(): { width: number; height: number } | null;
  /** The player moved the camera (`byUser`), or Fit map moved it. */
  onMoved(byUser: boolean): void;
  /** Tests pass their own clock and frames. */
  now?: () => number;
  frames?: Frames;
}

export class ViewportFollower {
  private readonly frames: Frames;
  private readonly now: () => number;
  private goal: Goal | null = null;
  private glide: { from: Pose; to: Pose; start: number } | null = null;
  private frame: number | null = null;
  private disposed = false;

  constructor(private readonly options: ViewportFollowerOptions) {
    this.frames = options.frames ?? ANIMATION_FRAMES;
    this.now = options.now ?? ((): number => performance.now());
    options.viewport.on('moved', this.onMoved);
  }

  /** Shows `camera`'s world area as large as fits this view: gliding with `animate`, else at once; `padded` leaves Fit map's margin. */
  setCamera(camera: ViewCamera, animate: boolean, padded = false): void {
    this.goal = { kind: 'view', view: { ...camera }, padded };
    this.go(animate);
  }

  /** Shows the whole map, gliding. */
  fitMap(): void {
    if (!this.options.mapSize()) return;
    this.goal = { kind: 'fit' };
    this.go(true);
    this.options.onMoved(false);
  }

  /** The view changed size: the camera shows the same area again. */
  resize(): void {
    this.go(false);
  }

  /** Something else moved the viewport (the map image loading re-centres it): put the camera back. */
  reapply(): void {
    this.go(false);
  }

  dispose(): void {
    this.disposed = true;
    this.options.viewport.off('moved', this.onMoved);
    if (this.frame !== null) this.frames.cancel(this.frame);
    this.frame = null;
  }

  private readonly onMoved = (event: { type: string }): void => {
    if (this.disposed || !PLAYER_MOVES.has(event.type)) return;
    this.goal = null;
    this.glide = null;
    this.options.onMoved(true);
  };

  private go(animate: boolean): void {
    const target = this.target();
    if (this.disposed || !target) return;
    const { viewport } = this.options;
    this.glide = animate ? { from: { centerX: viewport.center.x, centerY: viewport.center.y, zoom: viewport.scale.x }, to: target, start: this.now() } : null;
    if (animate) this.schedule();
    else this.apply(target);
  }

  private target(): Pose | null {
    const goal = this.goal;
    if (!goal) return null;
    const { screenWidth, screenHeight } = this.options.viewport;
    const screen = { width: Math.max(1, screenWidth), height: Math.max(1, screenHeight) };
    if (goal.kind === 'view') {
      const { view } = goal;
      return { centerX: view.centerX, centerY: view.centerY, zoom: fittingZoom(screen, view, goal.padded ? FIT_PADDING : 0) };
    }
    const map = this.options.mapSize();
    if (!map) return null;
    return { centerX: map.width / 2, centerY: map.height / 2, zoom: fittingZoom(screen, map, FIT_PADDING) };
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.frames.request(() => {
      this.frame = null;
      this.draw();
    });
  }

  private draw(): void {
    const glide = this.glide;
    if (this.disposed || !glide) return;
    const t = Math.min(1, (this.now() - glide.start) / GLIDE_MS);
    const eased = 1 - (1 - t) ** 3;
    const mix = (a: number, b: number): number => a + (b - a) * eased;
    this.apply({ centerX: mix(glide.from.centerX, glide.to.centerX), centerY: mix(glide.from.centerY, glide.to.centerY), zoom: mix(glide.from.zoom, glide.to.zoom) });
    if (t < 1) this.schedule();
    else this.glide = null;
  }

  private apply(pose: Pose): void {
    // setZoom first: moveCenter places the centre with the scale it finds.
    this.options.viewport.setZoom(pose.zoom);
    this.options.viewport.moveCenter(pose.centerX, pose.centerY);
  }
}
