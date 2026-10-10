import type { PlayerCameraState } from '../types/playerCamera';
import type { ViewportRect } from '../types/viewportTypes';

/**
 * The camera that shows exactly `rect` to the players, whatever shape the GM's pane has: it holds the
 * world rectangle it frames, and the player window fits all of that rectangle into its own shape.
 * `scale` is the zoom the GM's screen would need to show the rectangle (1 without a screen); it only
 * matters where the DM's own view is put back to what players saw.
 */
export function viewportFollowCamera(rect: ViewportRect, screen: { width: number; height: number } | undefined): PlayerCameraState {
  const fit = screen ? Math.min(screen.width / rect.width, screen.height / rect.height) : 1;
  return {
    centerX: rect.x + rect.width / 2,
    centerY: rect.y + rect.height / 2,
    scale: Number.isFinite(fit) && fit > 0 ? fit : 1,
    width: rect.width,
    height: rect.height,
  };
}
