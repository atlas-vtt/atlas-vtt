import type { EventEmitter } from 'events';
import type { StoreApi } from 'zustand';
import type { PlayerCameraState } from '../local-player-view';
import type { ViewAtlasState } from '../storeFactory';
import type { AtlasSettings } from './SettingsService';
import type { FramePiece, PlayerFrame, Screen } from '../types/playerFrame';
import { playerFrame, viewOf } from './playerFrame';
import type { PlayerRollSources } from './playerRollSource';

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
 * Renders `frame`, a picture that is safe to show players, at its own size and camera, and
 * hands its pixels to `copy` piece by piece. Nothing is handed out where none can be rendered.
 */
type PlayerSafeFrame = (copy: (piece: FramePiece) => void, settings: PlayerViewSettings, frame: PlayerFrame) => void;

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

/** A DM map view that can render its scene without DM-only layers, at a size and camera of the players' own. */
export interface PlayerFrameSource {
  store?: StoreApi<ViewAtlasState>;
  /** Dice events from the view that owns this canvas. */
  diceEvents?: EventEmitter;
  /** Which tokens the scene this canvas shows lets players see, for rolls to name. Without it rolls name nobody. */
  rollSources?: PlayerRollSources;
  /** The DM's camera, with the world rectangle the DM's screen shows through it. */
  getCamera?(): PlayerCameraState | undefined;
  /** The DM's screen: what a camera without a rectangle of its own is centred in, and the pixels the players' picture never has fewer of. */
  getScreen?(): Screen | undefined;
  /** False while nothing can be rendered (a lost graphics context): players keep the last frame. */
  canRender?(): boolean;
  /** Renders the players' frame, then the DM's frame again. */
  withPlayerSafeFrame: PlayerSafeFrame;
  /** Without it the scene is captured on every display frame of the player window. */
  beforeRender?: BeforeRenderCapture;
  /** Gives back what the source holds for players' frames, once the window shows it no longer. */
  release?(): void;
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
  /** The player window: its size in CSS pixels and its device pixels to each. Null while it has none. */
  window(): Screen | null;
  /** A still frame to show instead of the live canvas. */
  heldFrame(): HTMLCanvasElement | null;
  /**
   * The camera players stay on while the DM's own moves. One with a world rectangle (`width`,
   * `height`) keeps showing that rectangle; one without is centred in the DM's screen as it is now.
   */
  frozenCamera(): PlayerCameraState | null;
  settings(): PlayerViewSettings;
  /** Called after each live frame with the camera players saw it through. */
  onFrame(camera: PlayerCameraState | undefined): void;
}

/**
 * Brings player-safe frames of the presented scene onto the player window's canvas.
 *
 * A frame is rendered for the player window, not copied from the DM's pane: it has the window's
 * shape and pixels (`playerFrame`, up to its pixel budget), is centred on the centre of the
 * DM's view and scaled so that everything the DM's view shows fits into the window, with the
 * map around it in the rest. So the pane's size, a sidebar or a split next to it, changes
 * neither the players' sharpness nor crops their picture.
 *
 * A view that renders on change is captured right before its own renders: the players' frame
 * is rendered and copied, and the DM's render that follows in the same task puts the DM's
 * frame back on its canvas, so the DM never sees anything of the players' frame and a mirrored
 * frame costs one extra render. Frames skipped by the cap, or while the player window is
 * hidden, leave the mirror stale; `frame`, run on every display frame of the player window,
 * then asks the view for a render once one is due, so players always end on the DM's latest
 * state and an idle map is never rendered. A player window that changed size, or moved to a
 * screen with another pixel ratio, is stale too.
 *
 * While the presented scene loads, nothing is rendered for players: the store is rewritten in
 * steps and the stage holds the scene half built (unlit, without fog or line of sight), which
 * would give away the map. Players keep the last frame, and the mirror stays stale, so the
 * first display frame after the load asks for the finished scene. The same holds while the
 * view's graphics context is lost.
 *
 * Players frozen on a camera keep the world rectangle that camera framed when they were frozen,
 * whatever happens to the DM's pane.
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
  /** The window the last frame was rendered for. */
  private shown: Screen | null = null;

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
      if (!sameScreen(this.inputs.window(), this.shown)) this.stale = true;

      if (cannotRender(source)) {
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
      if (!this.frameOf(source)) {
        // No window to render for yet: no render is asked for, and none awaited
        this.requestedAt = null;
        return;
      }
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
    if (cannotRender(source) || !this.isDue(frameTime) || frameTime - this.lastFrameAt > ASLEEP_AFTER_MS) {
      this.stale = true;
      return;
    }
    const { beforeRender } = source;
    this.guarded(() => this.mirror(source, beforeRender, frameTime));
  };

  private watch(source: PlayerFrameSource | null): void {
    if (source === this.watched) return;
    this.stopListening?.();
    this.watched?.release?.();
    this.watched = source;
    this.stopListening = source?.beforeRender?.listen(this.beforeRender) ?? null;
    this.stale = true;
    this.requestedAt = null;
  }

  private isDue(time: number): boolean {
    return time - this.slotAt >= MIRROR_INTERVAL_MS - FRAME_TIME_SLACK_MS;
  }

  /** The camera players see `source` through: the one they are frozen on, else the DM's. */
  private cameraOf(source: PlayerFrameSource): PlayerCameraState | undefined {
    return this.inputs.frozenCamera() ?? source.getCamera?.();
  }

  /**
   * The frame players are shown of `source` now: for the player window, through the frozen
   * camera or the DM's. None while the window, or what the camera frames, has no size.
   */
  private frameOf(source: PlayerFrameSource): PlayerFrame | null {
    const window = this.inputs.window();
    const camera = this.cameraOf(source);
    const screen = source.getScreen?.();
    const view = camera ? viewOf(camera, screen) : null;
    return window && view ? playerFrame(window, view, screen) : null;
  }

  /** Bring a live frame of `source`, rendered through `frames`, onto the players' canvas. */
  private mirror(source: PlayerFrameSource, frames: { withPlayerSafeFrame: PlayerSafeFrame }, time: number): void {
    const frame = this.frameOf(source);
    if (!frame) {
      this.stale = true;
      return;
    }
    this.stale = false;
    // Slots follow each other without gaps, so a display that is no multiple of the cap still gets every slot; after a pause they start anew
    this.slotAt = time - this.slotAt >= 2 * MIRROR_INTERVAL_MS ? time : this.slotAt + MIRROR_INTERVAL_MS;
    this.requestedAt = null;
    this.shown = this.inputs.window();
    let copied = false;
    frames.withPlayerSafeFrame((piece) => {
      // The canvas takes the frame's size with its first piece: a frame that never comes leaves the last one standing
      if (!copied) this.resize(frame.width, frame.height);
      copied = true;
      this.context.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height, piece.left, piece.top, piece.width, piece.height);
    }, this.inputs.settings(), frame);
    if (!copied) {
      // Nothing could be rendered: players keep the last frame and are owed this one
      this.stale = true;
      return;
    }
    this.inputs.onFrame(this.cameraOf(source));
    this.failing = false;
  }

  private resize(width: number, height: number): void {
    if (this.target.width === width && this.target.height === height) return;
    this.target.width = width;
    this.target.height = height;
  }

  /** A still frame, at its own size: the window fits it into itself. */
  private draw(image: HTMLCanvasElement): void {
    this.resize(image.width, image.height);
    this.context.clearRect(0, 0, image.width, image.height);
    this.context.drawImage(image, 0, 0);
  }

  /** A failed frame must not stop the DM's render or the mirror; it is reported once until a frame succeeds. */
  private guarded(run: () => void): void {
    try {
      run();
    } catch (error) {
      if (!this.failing) console.error('[PlayerFrameMirror] Error rendering the players\' frame:', error);
      this.failing = true;
    }
  }
}

/** A source without a store never counts as loading. */
function isLoading(source: PlayerFrameSource): boolean {
  return source.store?.getState().isMapLoading === true;
}

/** Whether nothing of `source` may be rendered for players now: no loaded scene, or no graphics context. */
export function cannotRender(source: PlayerFrameSource): boolean {
  return isBetweenScenes(source) || isLoading(source) || source.canRender?.() === false;
}

function sameScreen(a: Screen | null, b: Screen | null): boolean {
  return a?.width === b?.width && a?.height === b?.height && a?.resolution === b?.resolution;
}
