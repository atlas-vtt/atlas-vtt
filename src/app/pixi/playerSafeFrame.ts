import type { PlayerCameraState } from '../local-player-view';
import type { Perception } from '../vision/perception';

/** Anything whose `visible` flag decides whether it is part of the next render. */
export interface HideableLayer {
  visible: boolean;
  alpha?: number | undefined;
  scale?: { x: number; set(x: number, y: number): void } | undefined;
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
  /** A uniform scale for the player frame, e.g. a pin sized for the player camera's zoom. */
  scale?: number;
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

/** The part of a viewport a player camera moves: its screen size and world transform. */
export interface CameraTarget {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly position: { x: number; y: number; set(x: number, y: number): void };
  readonly scale: { x: number; y: number; set(x: number, y: number): void };
}

/** A camera players stay on while the DM's own viewport moves freely. */
export interface PlayerFrameCamera {
  target: CameraTarget;
  camera: PlayerCameraState;
}

/**
 * Point `target` at `camera` by setting its transform directly, so no viewport
 * events or plugin resets fire. Returns a function that restores the DM camera.
 */
function applyCamera({ target, camera }: PlayerFrameCamera): () => void {
  const { x, y } = target.position;
  const { x: scaleX, y: scaleY } = target.scale;
  target.scale.set(camera.scale, camera.scale);
  target.position.set(
    target.screenWidth / 2 - camera.centerX * camera.scale,
    target.screenHeight / 2 - camera.centerY * camera.scale,
  );
  return (): void => {
    target.scale.set(scaleX, scaleY);
    target.position.set(x, y);
  };
}

/**
 * Apply the player frame's visibility, opacity and (optionally) frozen camera. Returns the
 * function that restores the DM's, and whether anything differs from the DM's frame.
 */
function applyPlayerFrame(layers: readonly LayerVisibility[], camera?: PlayerFrameCamera): { differs: boolean; restore: () => void } {
  const changed = layers.filter(({ layer, visible, alpha, scale }) =>
    layer.visible !== visible || (alpha !== undefined && layer.alpha !== alpha)
    || (scale !== undefined && layer.scale !== undefined && layer.scale.x !== scale))
    .map(entry => ({ ...entry, previous: entry.layer.visible, previousAlpha: entry.layer.alpha, previousScale: entry.layer.scale?.x }));
  for (const { layer, visible, alpha, scale } of changed) {
    layer.visible = visible;
    if (alpha !== undefined) layer.alpha = alpha;
    if (scale !== undefined) layer.scale?.set(scale, scale);
  }
  const restoreCamera = camera ? applyCamera(camera) : null;
  return {
    differs: changed.length > 0 || !!camera,
    restore: (): void => {
      restoreCamera?.();
      for (const { layer, previous, alpha, previousAlpha, scale, previousScale } of changed) {
        layer.visible = previous;
        if (alpha !== undefined) layer.alpha = previousAlpha;
        if (scale !== undefined && previousScale !== undefined) layer.scale?.set(previousScale, previousScale);
      }
    },
  };
}

/**
 * Temporarily apply player visibility, opacity and (optionally) a frozen player
 * camera, then restore the DM frame.
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
 * `captureWithLayerVisibility` for a caller whose own render of the DM frame follows in the
 * same task (`RenderScheduler`'s before-render hook), so restoring costs no render. The
 * player frame is always rendered: the canvas still holds the previous frame.
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
