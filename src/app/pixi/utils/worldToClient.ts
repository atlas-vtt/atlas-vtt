import type { Viewport } from 'pixi-viewport';

export interface ClientPoint {
  x: number;
  y: number;
}

/**
 * Where a point of the canvas lies in the window. A viewport's screen points count from its
 * canvas' corner, which a sidebar or a tab bar moves away from the window's.
 */
function canvasToClient(canvas: HTMLCanvasElement | null | undefined, x: number, y: number): ClientPoint {
  const rect = canvas?.getBoundingClientRect();
  return { x: (rect?.left ?? 0) + x, y: (rect?.top ?? 0) + y };
}

/** Where a world point lies in the window, for DOM placed with `position: fixed` beside it. */
export function worldToClient(
  viewport: Viewport,
  canvas: HTMLCanvasElement | null | undefined,
  worldX: number,
  worldY: number,
): ClientPoint {
  const screen = viewport.toScreen(worldX, worldY);
  return canvasToClient(canvas, screen.x, screen.y);
}

/** Where the middle of the view lies in the window. */
export function viewCentreInClient(viewport: Viewport, canvas: HTMLCanvasElement | null | undefined): ClientPoint {
  return canvasToClient(canvas, viewport.screenWidth / 2, viewport.screenHeight / 2);
}
