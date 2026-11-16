import type { PlayerCameraState } from '../types/playerCamera';
import type { WorldFrame } from '../types/playerFrame';
import type { TableTv, TvSetupScreen } from './tableTvFrame';

/**
 * What the GM's side of the player window keeps besides the picture: the set-up screen the TV
 * shows (TrueScale's Which way is up and the card fit) and who follows the players' camera
 * (the glass on the GM's map). `PlayerWindowService` owns one.
 */
export class PlayerGlass {
  private screen: TvSetupScreen | null = null;
  private readonly listeners = new Set<() => void>();

  setupScreen(): TvSetupScreen | null {
    return this.screen;
  }

  showSetup(state: TvSetupScreen | null): void {
    this.screen = state;
  }

  onCameraChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Tells every listener; one that throws neither stops the others nor the frame that moved the camera. */
  cameraChanged(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error('[Atlas] A follower of the players\' camera failed', error);
      }
    }
  }
}

/**
 * `tv` as players see it while `screen` is shown: during the card fit at the dial's pixels per
 * mm, at true scale, so the map on the TV follows the dial (the setup stored stays as it is
 * until the GM commits).
 */
export function withSetupScreen(tv: TableTv, screen: TvSetupScreen | null): TableTv {
  if (screen?.kind !== 'fit') return tv;
  return { ...tv, trueScale: true, setup: { pxPerMm: screen.pxPerMm, rotation: tv.setup?.rotation ?? tv.rotation } };
}

/**
 * The glass: what players see, `following` (`playerViewFrame`), else, before their frame has a
 * size, the rectangle a pinned camera frames.
 */
export function glassFrame(following: WorldFrame | null, pinned: PlayerCameraState | null): WorldFrame | null {
  if (following) return following;
  if (!pinned?.width || !pinned.height) return null;
  return { centerX: pinned.centerX, centerY: pinned.centerY, width: pinned.width, height: pinned.height };
}

/** Whether two cameras frame the same: then players saw no move. */
export function sameCamera(a: PlayerCameraState | null | undefined, b: PlayerCameraState | null | undefined): boolean {
  return a?.centerX === b?.centerX && a?.centerY === b?.centerY && a?.scale === b?.scale
    && a?.width === b?.width && a?.height === b?.height;
}
