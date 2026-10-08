/**
 * What moves in a remote view: the player's drag of the tokens they may move (reported to the
 * owner at the snapped drop point, `remoteDrag.ts`) and the camera, which the owner sets and the
 * player or Fit map moves (`ViewportFollower`).
 */
import type { EventEmitter } from 'events';
import type { Viewport } from 'pixi-viewport';
import type { TokenMove } from '../../api/types/tokens';
import type { ViewCamera } from '../services/presentedCamera';
import type { ViewAtlasStore } from '../storeFactory';
import { cancelLostDrag, mayDragInRemoteView, REMOTE_DRAG_CANCEL, REMOTE_TOKEN_DROPPED, type RemoteDrop } from './remoteDrag';
import { callGuarded, ListenerSet } from './listeners';
import { framesIn, ViewportFollower, type FollowViewport } from './ViewportFollower';

export interface RemoteMotionHost {
  readonly atlasStore: ViewAtlasStore;
  readonly eventBus: EventEmitter;
  readonly viewport: Viewport | null;
  /** The map's size, for Fit map. */
  mapSize(): { width: number; height: number } | null;
  /** Writes the scene again, so a token whose drag ended stands where the scene has it. */
  refreshScene(): void;
  /** The window the view is in now (a popout's own), for the camera's animation frames. */
  readonly windowOf?: () => Window;
}

function followViewport(viewport: Viewport): FollowViewport {
  return {
    get screenWidth(): number { return viewport.screenWidth; },
    get screenHeight(): number { return viewport.screenHeight; },
    get center(): { x: number; y: number } { return viewport.center; },
    get scale(): { x: number } { return viewport.scale; },
    setZoom: (scale) => viewport.setZoom(scale),
    moveCenter: (x, y) => viewport.moveCenter(x, y),
    on: (event, listener) => viewport.on(event, listener),
    off: (event, listener) => viewport.off(event, listener),
  };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export class RemoteViewMotion {
  readonly drops = new ListenerSet<(move: TokenMove) => void>('onTokenDrop');
  readonly cameraMoves = new ListenerSet<(byUser: boolean) => void>('onCameraMoved');
  private readonly follower: ViewportFollower | null;

  constructor(private readonly host: RemoteMotionHost) {
    this.follower = host.viewport ? new ViewportFollower({
      viewport: followViewport(host.viewport),
      mapSize: () => host.mapSize(),
      onMoved: (byUser) => { for (const listener of this.cameraMoves.list()) callGuarded('camera', listener, byUser); },
      ...(host.windowOf ? { frames: framesIn(host.windowOf) } : {}),
    }) : null;
    host.eventBus.on(REMOTE_TOKEN_DROPPED, this.onDrop);
    host.eventBus.on('background-sprite-updated', this.onBackgroundMoved);
  }

  setCamera(camera: ViewCamera, options?: { animate?: boolean; padded?: boolean }): void {
    // Each field read once, so a getter cannot change it after the check.
    const { centerX, centerY, width, height } = (typeof camera === 'object' && camera !== null ? camera : {}) as Partial<ViewCamera>;
    const valid = isFiniteNumber(centerX) && isFiniteNumber(centerY) && isFiniteNumber(width) && width > 0 && isFiniteNumber(height) && height > 0;
    if (!valid) throw new Error('[Atlas API] RemoteView.setCamera: the camera must be { centerX, centerY, width, height } numbers, with a size above 0.');
    const area = { centerX, centerY, width, height };
    this.follower?.setCamera(area, options?.animate === true, options?.padded === true);
  }

  /** Fit map: the whole map, and the owner is told the camera moved, not by the player. */
  fitMap(): void {
    this.follower?.fitMap();
  }

  cancelDrag(): void {
    this.host.eventBus.emit(REMOTE_DRAG_CANCEL);
    this.host.refreshScene();
  }

  /** After a new scene or player state: a drag whose token left the scene or may no longer move ends. */
  checkDrag(): void {
    // The drag puts the token back where it started; the scene then puts it where it is now.
    if (cancelLostDrag(this.host.atlasStore.getState(), this.host.eventBus)) this.host.refreshScene();
  }

  resize(): void {
    this.follower?.resize();
  }

  dispose(): void {
    this.drops.close();
    this.cameraMoves.close();
    this.host.eventBus.off(REMOTE_TOKEN_DROPPED, this.onDrop);
    this.host.eventBus.off('background-sprite-updated', this.onBackgroundMoved);
    this.follower?.dispose();
  }

  private readonly onDrop = (drop: RemoteDrop): void => {
    if (mayDragInRemoteView(this.host.atlasStore.getState(), drop.tokenId)) {
      const move: TokenMove = Object.freeze({ tokenId: drop.tokenId, x: drop.x, y: drop.y });
      for (const listener of this.drops.list()) callGuarded('token drop', listener, move);
    }
    this.host.refreshScene();
  };

  private readonly onBackgroundMoved = (): void => {
    this.follower?.reapply();
  };
}
