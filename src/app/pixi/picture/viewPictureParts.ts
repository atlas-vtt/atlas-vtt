import type { AnnotationsRenderer } from '../annotations/AnnotationsRenderer';
import type { FogOfWarRenderer } from '../fog/FogOfWarRenderer';
import type { LightingController } from '../lighting/LightingController';
import type { SceneLightingView } from '../lighting/sceneLightingView';
import type { LiquidLayer } from '../liquids/LiquidLayer';
import type { MeasureRenderer } from '../measure/MeasureRenderer';
import type { MosaicCanvas } from '../mosaicCanvas/MosaicCanvas';
import type { PinRenderer } from '../PinRenderer';
import type { HideableLayer } from '../playerSafeFrame';
import type { ViewRoofs } from '../roofs/ViewRoofs';
import { NOTHING_SEEN } from '../token-renderer/PlayerSightTokens';
import type { TokenRenderer } from '../TokenRenderer';
import type { Picture, PicturePart } from './picture';

const noop = (): void => undefined;

/**
 * The map image: the tesserae of the picture's own view, and in a picture of the scene an animated
 * map's poster, as its asset card shows, not whatever frame plays now.
 */
export function mapImagePicture(image: Pick<MosaicCanvas, 'drawFor' | 'hideVideoFor' | 'addDemandRegion'>): PicturePart {
  return {
    showFor: (picture) => {
      const restoreView = picture.view ? image.drawFor(picture.view) : noop;
      if (picture.kind === 'players') return restoreView;
      const restoreVideo = image.hideVideoFor();
      return (): void => {
        restoreVideo();
        restoreView();
      };
    },
    keepReady: (view) => image.addDemandRegion(view),
  };
}

/** The roof at the picture's own detail: faded under the party in the players' frame, whole in a picture of the scene. */
export function roofsPicture(roofs: Pick<ViewRoofs, 'modeLayer' | 'drawFor' | 'renderForFrame' | 'addDemandRegion'>): PicturePart {
  return {
    showFor: (picture) => (picture.view ? roofs.drawFor(picture.view) : noop),
    layersFor: (picture) => (picture.kind === 'players' ? [{ layer: roofs.modeLayer, visible: true }] : []),
    renderFor: <T,>(picture: Picture, render: () => T): T => (picture.kind === 'scene' ? roofs.renderForFrame(picture.frame, render) : render()),
    keepReady: (view) => roofs.addDemandRegion(view),
  };
}

/** The pins: the players' frame shows those the players see in place of the GM's, a picture of the scene none. */
export function pinsPicture(pins: Pick<PinRenderer, 'playerLayers' | 'pictureLayers'>): PicturePart {
  return { layersFor: (picture) => (picture.kind === 'players' ? pins.playerLayers() : pins.pictureLayers()) };
}

/** The tokens: those the players perceive in their frame, as the GM view shows them in a picture of the scene. */
export function tokensPicture(tokens: Pick<TokenRenderer, 'getPlayerViewLayers' | 'getGmViewLayers'>): PicturePart {
  return { layersFor: (picture) => (picture.kind === 'players' ? tokens.getPlayerViewLayers(picture.settings, picture.sight) : tokens.getGmViewLayers()) };
}

/**
 * The measurements: in the players' frame those from tokens they see by the frame's sight (none
 * without tokens), as the GM view shows them in a picture of the scene, whose effects hold their still picture.
 */
export function measuresPicture(
  measures: Pick<MeasureRenderer, 'getPlayerViewLayers' | 'getGmViewLayers'> & { readonly effects: { stillFor(): () => void } },
  tokens: () => Pick<TokenRenderer, 'playersSeeInFrame'> | undefined,
): PicturePart {
  return {
    showFor: (picture) => (picture.kind === 'scene' ? measures.effects.stillFor() : noop),
    layersFor: (picture) => (picture.kind === 'players'
      ? measures.getPlayerViewLayers(tokens()?.playersSeeInFrame(picture.sight) ?? NOTHING_SEEN)
      : measures.getGmViewLayers()),
  };
}

/** The liquids hold their still moment in a picture of the scene, so it is the same however long they played. */
export function liquidsPicture(liquids: Pick<LiquidLayer, 'stillFor'>): PicturePart {
  return { showFor: (picture) => (picture.kind === 'scene' ? liquids.stillFor() : noop) };
}

/**
 * The lighting: the players' view and the levels below in their look for their frame, the list
 * session view holds on the canvas (`SessionLighting`); a picture of the scene is lit for its own
 * frame as the GM sees it, without the GM's editors and badges and without what only the players' view shows.
 */
export function lightingPicture(
  lighting: Pick<LightingController, 'playerLayers' | 'gmOverlays' | 'playerOnlyLayers'> & { readonly renderer: Pick<SceneLightingView, 'renderForFrame' | 'prepareBelow'> },
): PicturePart {
  return {
    layersFor: (picture) => (picture.kind === 'players'
      ? lighting.playerLayers()
      : [...Object.values<HideableLayer>(lighting.gmOverlays()), ...lighting.playerOnlyLayers()].map((layer) => ({ layer, visible: false }))),
    renderFor: <T,>(picture: Picture, render: () => T): T => {
      if (picture.kind === 'scene') return lighting.renderer.renderForFrame(picture.frame, render);
      // The GM's own levels below are bound again before the GM's render.
      const { width, height, resolution } = picture.frame;
      lighting.renderer.prepareBelow?.({ key: 'frame', width: width / resolution, height: height / resolution, mode: 'player' });
      return render();
    },
  };
}

/** The fog: opaque and without the tool's marks in the players' frame, as translucent as the GM view shows it in a picture of the scene. */
export function fogPicture(fog: Pick<FogOfWarRenderer, 'getPlayerViewLayers' | 'getGmViewLayers'>): PicturePart {
  return { layersFor: (picture) => (picture.kind === 'players' ? fog.getPlayerViewLayers() : fog.getGmViewLayers()) };
}

/**
 * The drawings and texts: every one the picture shows is drawn for it, also where neither the
 * canvas's camera nor a region has asked for it; neither picture shows what only the GM sees.
 */
export function annotationsPicture(annotations: Pick<AnnotationsRenderer, 'showFor' | 'getPlayerViewLayers' | 'getPictureLayers' | 'addDemandRegion'>): PicturePart {
  return {
    showFor: (picture) => annotations.showFor(picture.view),
    layersFor: (picture) => (picture.kind === 'players' ? annotations.getPlayerViewLayers() : annotations.getPictureLayers()),
    keepReady: (view) => annotations.addDemandRegion(view),
  };
}

/** The GM's overlays on the screen, left out of the players' frame; a picture of the scene renders the map alone. */
export function screenOverlaysPicture(overlays: ReadonlySet<HideableLayer>): PicturePart {
  return { layersFor: (picture) => (picture.kind === 'players' ? [...overlays].map((layer) => ({ layer, visible: false })) : []) };
}

/** Layers only the players' frame shows (`addPlayerFrameLayer`). */
export function playerFrameOnlyPicture(layers: ReadonlySet<HideableLayer>): PicturePart {
  return { layersFor: (picture) => (picture.kind === 'players' ? [...layers].map((layer) => ({ layer, visible: true })) : []) };
}
