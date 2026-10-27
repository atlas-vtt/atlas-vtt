import type { GmOverlays } from './lighting/playerLightingLayers';
import type { SceneFrame } from './lighting/engine/types';
import type { SceneLightingView } from './lighting/sceneLightingView';
import { captureWithLayerVisibility, type HideableLayer, type LayerVisibility } from './playerSafeFrame';

/** Runs the off-screen render of a picture of the scene with what the scene needs around it, and returns its result. */
export type SceneFrameCapture = <T>(frame: SceneFrame, render: () => T) => T;

export interface SceneFrameParts {
  /**
   * What the GM view shows of tokens and fog, forced for the render: the canvas may be in
   * session view, which hides and dims by the players' sight. Whatever else a view of the
   * canvas hides from the GM's picture belongs in here.
   */
  gmViewLayers: readonly LayerVisibility[];
  /** The GM's markers on the map (pins, linked hexes): not part of a picture of the scene. */
  markerLayers: readonly LayerVisibility[];
  /**
   * The scene's lighting and its editors and badges, which the player frame hides too, and the
   * layers only the players' view shows (their door badges), which session view leaves on the
   * canvas; none on a view without lighting.
   */
  lighting: { gmOverlays(): GmOverlays; playerOnlyLayers?(): readonly HideableLayer[]; readonly renderer: Pick<SceneLightingView, 'renderForFrame'> } | undefined;
  /** The roof of the level shown, drawn whole for the picture; none on a view without one. */
  roofs?: { renderForFrame<T>(frame: SceneFrame, render: () => T): T } | undefined;
}

/** A picture is rendered off-screen: the canvas keeps the GM's frame, so nothing is drawn on it. */
const KEEP_CANVAS = (): void => undefined;

/**
 * Renders a picture of the scene (a thumbnail) outside the stage's render. It is always the
 * GM's picture, whatever view the canvas is in: tokens and fog as the GM view shows them, lit
 * for its own frame in GM mode, without the GM's markers and editors. The layers are back
 * when this returns and the canvas is never drawn meanwhile, so the GM sees no frame without
 * them. The render consumes the stage's pending updates: the caller asks for a render after it.
 */
export function captureSceneFrame<T>({ gmViewLayers, markerLayers, lighting, roofs }: SceneFrameParts, frame: SceneFrame, render: () => T): T {
  const hidden = [...Object.values<HideableLayer>(lighting?.gmOverlays() ?? {}), ...(lighting?.playerOnlyLayers?.() ?? [])];
  const layers = [
    ...gmViewLayers,
    ...markerLayers,
    ...hidden.map((layer) => ({ layer, visible: false })),
  ];
  let picture!: T;
  captureWithLayerVisibility(layers, KEEP_CANVAS, () => {
    const lit = (): T => (lighting ? lighting.renderer.renderForFrame(frame, render) : render());
    picture = roofs ? roofs.renderForFrame(frame, lit) : lit();
  });
  return picture;
}
