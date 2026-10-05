import type { EventEmitter } from 'events';
import type { StoreApi } from 'zustand';
import type { PlayerCameraState } from '../local-player-view';
import type { ViewAtlasState } from '../storeFactory';
import type { AtlasSettings } from './SettingsService';

type PlayerViewSettings = AtlasSettings['localPlayerView'];

/** Most frames per second the player window mirrors, however fast the DM canvas renders. */
export const PLAYER_MIRROR_FPS = 60;
const MIRROR_INTERVAL_MS = 1000 / PLAYER_MIRROR_FPS;
/** A display frame may come this much early for its slot, so frames a full interval apart are never just short of it. */
const FRAME_TIME_SLACK_MS = 1;
/**
 * A window without a display frame for this long is hidden, and its animation frames sleep. A
 * hidden player window is mirrored nothing; for a hidden DM window, whose requested renders do
 * not come, the mirror renders the frame itself.
 */
const ASLEEP_AFTER_MS = 250;

/**
 * Runs `capture` while the canvas holds a frame that is safe to show players,
 * rendered from `camera` when given instead of the DM's camera.
 */
type PlayerSafeFrame = (capture: () => void, settings: PlayerViewSettings, camera?: PlayerCameraState) => void;

/** What a canvas that renders only on change offers a mirror, so mirroring costs it one render per frame. */
export interface BeforeRenderCapture {
  /**
   * Runs `listener`, with the display frame's time, right before each render of the canvas and
   * in the same task. Returns the function that removes it.
   */
  listen(listener: (frameTime: number) => void): () => void;
  /** Render the canvas on its next tick even if nothing changed. */
  requestRender(): void;
  /** For a listener: leaves restoring the DM's frame to the render that follows. */
  withPlayerSafeFrame: PlayerSafeFrame;
}

/** A DM map canvas that can briefly render itself without DM-only layers. */
export interface PlayerFrameSource {
  canvas: HTMLCanvasElement;
  store?: StoreApi<ViewAtlasState>;
  /** Dice events from the view that owns this canvas. */
  diceEvents?: EventEmitter;
  getCamera?(): PlayerCameraState | undefined;
  /** Renders the player frame for `capture`, then the DM's frame again. */
  withPlayerSafeFrame: PlayerSafeFrame;
  /** Without it the canvas is captured on every display frame of the player window. */
  beforeRender?: BeforeRenderCapture;
}

/**
 * Whether the canvas shows no loaded scene: one is loading or failed to load, so fog and
 * tokens may be missing. Players keep the last frame until a scene is loaded again.
 */
function isBetweenScenes(source: PlayerFrameSource): boolean {
  return source.store?.getState().mapLoaded === false;
}

/** What the mirror shows, read anew on every frame. */
export interface MirrorInputs {
  source(): PlayerFrameSource | null;
  /** A still frame to show instead of the live canvas. */
  heldFrame(): HTMLCanvasElement | null;
  frozenCamera(): PlayerCameraState | null;
  settings(): PlayerViewSettings;
  /** Called after each live frame with the camera players saw it through. */
  onFrame(camera: PlayerCameraState | undefined): void;
}

/**
 * Copies player-safe frames of the presented DM canvas onto the player window's canvas.
 *
 * A canvas that renders on change is captured right before its own renders: the player frame
 * is rendered and copied, and the DM's render that follows in the same task puts the DM's
 * frame back, so the DM never sees the player frame and a mirrored frame costs one extra
 * render. Frames skipped by the cap, or while the player window is hidden, leave the mirror
 * stale; `frame`, run on every display frame of the player window, then asks the canvas for a
 * render once one is due, so players always end on the DM's latest state and an idle canvas
 * is never rendered.
 *
 * While the presented scene loads, nothing live is captured: the store is rewritten in steps
 * and the canvas shows the scene half built (unlit, without fog or line of sight), which would
 * give away the map. Players keep the last frame, and the mirror stays stale, so the first
 * display frame after the load asks for the finished scene.
 */
export class PlayerFrameMirror {
  private stale = true;
  /** Start of the slot, one mirror interval long, that the last mirrored frame filled. */
  private slotAt = -Infinity;
  private lastFrameAt = -Infinity;
  /** Since when a requested render is awaited. */
  private requestedAt: number | null = null;
  private lastHeld: HTMLCanvasElement | null = null;
  private watched: PlayerFrameSource | null = null;
  private stopListening: (() => void) | null = null;
  private failing = false;

  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
    private readonly inputs: MirrorInputs,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Players see something the DM canvas did not render for: settings, the camera freeze. */
  markStale(): void {
    this.stale = true;
  }

  /** Run on every display frame of the player window. */
  frame(): void {
    const now = this.now();
    this.lastFrameAt = now;
    const source = this.inputs.source();
    this.watch(source);
    if (!source) return;
    this.guarded(() => {
      const held = this.inputs.heldFrame();
      if (held) {
        // A held frame is static: draw it once, then idle until it changes
        if (held !== this.lastHeld) this.draw(held);
        this.lastHeld = held;
        return;
      }
      if (this.lastHeld) this.stale = true;
      this.lastHeld = null;

      if (isBetweenScenes(source) || isLoading(source)) {
        // The wait for a requested render starts when the scene is in, not before
        this.stale = true;
        this.requestedAt = null;
        return;
      }
      if (!source.beforeRender) {
        this.mirror(source, source, now);
        return;
      }
      if (!this.stale || !this.isDue(now)) return;
      this.requestedAt ??= now;
      if (now - this.requestedAt < ASLEEP_AFTER_MS) source.beforeRender.requestRender();
      else this.mirror(source, source, now);
    });
  }

  stop(): void {
    this.watch(null);
  }

  private readonly beforeRender = (frameTime: number): void => {
    const source = this.watched;
    // A canvas that is no longer presented, or stands behind a held frame, is not what players see
    if (!source?.beforeRender || source !== this.inputs.source() || this.inputs.heldFrame()) return;
    if (isBetweenScenes(source) || isLoading(source) || !this.isDue(frameTime) || frameTime - this.lastFrameAt > ASLEEP_AFTER_MS) {
      this.stale = true;
      return;
    }
    const { beforeRender } = source;
    this.guarded(() => this.mirror(source, beforeRender, frameTime));
  };

  private watch(source: PlayerFrameSource | null): void {
    if (source === this.watched) return;
    this.stopListening?.();
    this.watched = source;
    this.stopListening = source?.beforeRender?.listen(this.beforeRender) ?? null;
    this.stale = true;
    this.requestedAt = null;
  }

  private isDue(time: number): boolean {
    return time - this.slotAt >= MIRROR_INTERVAL_MS - FRAME_TIME_SLACK_MS;
  }

  /** Copy a live frame of `source`, rendered through `frames`. */
  private mirror(source: PlayerFrameSource, frames: { withPlayerSafeFrame: PlayerSafeFrame }, time: number): void {
    this.stale = false;
    // Slots follow each other without gaps, so a display that is no multiple of the cap still gets every slot; after a pause they start anew
    this.slotAt = time - this.slotAt >= 2 * MIRROR_INTERVAL_MS ? time : this.slotAt + MIRROR_INTERVAL_MS;
    this.requestedAt = null;
    const camera = this.inputs.frozenCamera() ?? undefined;
    frames.withPlayerSafeFrame(() => this.draw(source.canvas), this.inputs.settings(), camera);
    this.inputs.onFrame(camera ?? source.getCamera?.());
    this.failing = false;
  }

  private draw(image: HTMLCanvasElement): void {
    if (this.target.width !== image.width || this.target.height !== image.height) {
      this.target.width = image.width;
      this.target.height = image.height;
    }
    this.context.clearRect(0, 0, image.width, image.height);
    this.context.drawImage(image, 0, 0);
  }

  /** A failed copy must not stop the DM's render or the mirror; it is reported once until a frame succeeds. */
  private guarded(run: () => void): void {
    try {
      run();
    } catch (error) {
      if (!this.failing) console.error('[PlayerFrameMirror] Error copying canvas:', error);
      this.failing = true;
    }
  }
}

/** A source without a store never counts as loading. */
function isLoading(source: PlayerFrameSource): boolean {
  return source.store?.getState().isMapLoading === true;
}
