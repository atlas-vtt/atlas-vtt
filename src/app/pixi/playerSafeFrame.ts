import type { PlayerCameraState } from '../types/playerCamera';
import type { PlayerFrame, Size } from '../types/playerFrame';
import type { Perception } from '../vision/perception';

/** Anything whose `visible` flag decides whether it is part of the next render. */
export interface HideableLayer {
  visible: boolean;
  alpha?: number | undefined;
}

/**
 * Runs `capture` while the canvas holds a frame without `dmOnlyLayers`, then
 * restores the DM's frame. Everything happens in one task, before the browser
 * composites, so the DM never sees the player-safe frame.
 */
export function captureWithoutLayers(
  dmOnlyLayers: readonly HideableLayer[],
  render: () => void,
  capture: () => void
): void {
  captureWithLayerVisibility(dmOnlyLayers.map(layer => ({ layer, visible: false })), render, capture);
}

export interface LayerVisibility {
  layer: HideableLayer;
  visible: boolean;
  alpha?: number;
}

/**
 * Sets each layer's visibility and leaves it so, for a view that lasts longer than one captured
 * frame. Of two entries for one layer the later decides.
 */
export function setLayerVisibility(layers: readonly LayerVisibility[]): void {
  const wanted = new Map<HideableLayer, boolean>();
  for (const { layer, visible } of layers) wanted.set(layer, visible);
  for (const [layer, visible] of wanted) {
    if (layer.visible !== visible) layer.visible = visible;
  }
}

/**
 * Sprites of tokens players must not see: hidden ones (the DM sees them translucent) and,
 * with dynamic lighting, those no player token sees (`perception`). A token the players only
 * sense is left out too: its outline stands for it (`SensedOutlines`).
 */
export function hiddenTokenLayers(
  tokens: Record<string, { isHidden?: boolean }>,
  sprites: Record<string, HideableLayer | null>,
  perception: (tokenId: string) => Perception = () => 'seen',
): LayerVisibility[] {
  const layers: LayerVisibility[] = [];
  for (const [tokenId, sprite] of Object.entries(sprites)) {
    if (sprite && (tokens[tokenId]?.isHidden || perception(tokenId) !== 'seen')) layers.push({ layer: sprite, visible: false });
  }
  return layers;
}

/** How translucent the GM sees a hidden token. */
export const HIDDEN_TOKEN_ALPHA = 0.5;

/**
 * Every token sprite as the GM view shows it, hidden tokens translucent, whatever the canvas
 * shows now (session view hides hidden tokens and those out of the players' sight): for a
 * picture of the scene, which is always the GM's.
 */
export function gmTokenLayers(
  tokens: Record<string, { isHidden?: boolean }>,
  sprites: Record<string, HideableLayer | null>,
): LayerVisibility[] {
  const layers: LayerVisibility[] = [];
  for (const [tokenId, sprite] of Object.entries(sprites)) {
    if (sprite) layers.push({ layer: sprite, visible: true, alpha: tokens[tokenId]?.isHidden ? HIDDEN_TOKEN_ALPHA : 1 });
  }
  return layers;
}

/** The part of a viewport a player camera moves: its world transform. */
export interface CameraTarget {
  readonly position: { x: number; y: number; set(x: number, y: number): void };
  readonly scale: { x: number; y: number; set(x: number, y: number): void };
}

/**
 * The camera of a players' frame: it shows `camera` in the middle of a render of `screen`'s
 * size, whatever size the DM's own screen has, while the DM's viewport moves freely.
 */
export interface PlayerFrameCamera {
  target: CameraTarget;
  camera: Pick<PlayerCameraState, 'centerX' | 'centerY' | 'scale'>;
  screen: Size;
}

/** The camera that renders `frame` on `target`: centred in the frame's own size in points. */
export function frameCamera(target: CameraTarget, frame: PlayerFrame): PlayerFrameCamera {
  return { target, camera: frame, screen: { width: frame.width / frame.resolution, height: frame.height / frame.resolution } };
}

/**
 * Point `target` at `camera` by setting its transform directly, so no viewport
 * events or plugin resets fire. Returns a function that restores the DM camera.
 */
function applyCamera({ target, camera, screen }: PlayerFrameCamera): () => void {
  const { x, y } = target.position;
  const { x: scaleX, y: scaleY } = target.scale;
  target.scale.set(camera.scale, camera.scale);
  target.position.set(
    screen.width / 2 - camera.centerX * camera.scale,
    screen.height / 2 - camera.centerY * camera.scale,
  );
  return (): void => {
    target.scale.set(scaleX, scaleY);
    target.position.set(x, y);
  };
}

/**
 * Apply the player frame's visibility, opacity and (optionally) its camera. Returns the
 * function that restores the DM's, and whether anything differs from the DM's frame.
 */
function applyPlayerFrame(layers: readonly LayerVisibility[], camera?: PlayerFrameCamera): { differs: boolean; restore: () => void } {
  const changed = layers.filter(({ layer, visible, alpha }) =>
    layer.visible !== visible || (alpha !== undefined && layer.alpha !== alpha))
    .map(entry => ({ ...entry, previous: entry.layer.visible, previousAlpha: entry.layer.alpha }));
  for (const { layer, visible, alpha } of changed) {
    layer.visible = visible;
    if (alpha !== undefined) layer.alpha = alpha;
  }
  const restoreCamera = camera ? applyCamera(camera) : null;
  return {
    differs: changed.length > 0 || !!camera,
    restore: (): void => {
      restoreCamera?.();
      for (const { layer, previous, alpha, previousAlpha } of changed) {
        layer.visible = previous;
        if (alpha !== undefined) layer.alpha = previousAlpha;
      }
    },
  };
}

/**
 * Temporarily apply player visibility, opacity and (optionally) a players' camera, then
 * restore the DM frame.
 */
export function captureWithLayerVisibility(
  layers: readonly LayerVisibility[],
  render: () => void,
  capture: () => void,
  camera?: PlayerFrameCamera,
): void {
  const { differs, restore } = applyPlayerFrame(layers, camera);
  if (!differs) {
    capture();
    return;
  }
  try {
    render();
    capture();
  } finally {
    restore();
    render();
  }
}

/**
 * `captureWithLayerVisibility` for a caller that renders the DM's frame itself afterwards, or
 * whose own render of it follows in the same task (`RenderScheduler`'s before-render hook), so
 * restoring costs no render here. The player frame is always rendered: nothing holds it yet.
 */
export function captureBeforeRender(
  layers: readonly LayerVisibility[],
  render: () => void,
  capture: () => void,
  camera?: PlayerFrameCamera,
): void {
  const { restore } = applyPlayerFrame(layers, camera);
  try {
    render();
    capture();
  } finally {
    restore();
  }
}
