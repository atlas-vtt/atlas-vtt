import type { AtlasSettings } from '../../services/SettingsService';
import type { PlayerFrame } from '../../types/playerFrame';
import type { TokenPerception } from '../../vision/tokenPerception';
import type { SceneFrame } from '../lighting/engine/types';
import type { TesseraView } from '../mosaicCanvas/levelOfDetail';
import type { HideableLayer, LayerVisibility } from '../playerSafeFrame';

/** The players' frame: what the player window shows, at its own size and through its own camera. */
export interface PlayersFrame {
  readonly kind: 'players';
  readonly frame: PlayerFrame;
  /** The world the frame's pixels cover, and how much of it each pixel shows (`frameView`). */
  readonly view: TesseraView;
  readonly settings: AtlasSettings['localPlayerView'];
  /** How the players perceive each token by the scene's lighting; none while the scene is unlit. */
  readonly sight: TokenPerception | undefined;
  /** The GM's own render follows in the same task (the before-render hook) and puts the GM's frame back on the canvas. */
  readonly renderFollows: boolean;
}

/**
 * A picture of the scene (a scene card): always the GM's, without the GM's marks, lit for its own
 * frame, also while the canvas shows the players' picture. Session view must therefore hide
 * through the layers' `visible` and `alpha`, which a picture sets back to the GM's.
 */
export interface ScenePicture {
  readonly kind: 'scene';
  readonly frame: SceneFrame;
  /** The world the picture shows and at what detail; null where it frames no map image. */
  readonly view: TesseraView | null;
}

/** A picture of a map view rendered for someone other than the GM's canvas. */
export type Picture = PlayersFrame | ScenePicture;

/**
 * How one part of a map view draws a picture other than the GM's canvas shows. A part says only
 * what it changes; `PictureCapture` makes every change for one render and puts it back.
 */
export interface PicturePart {
  /** Draws what `picture` shows of the part (another view's detail, a still moment) until the returned function puts the canvas's back. */
  showFor?(picture: Picture): () => void;
  /** The part's layers as `picture` shows them: every part's are set together, after every `showFor`. */
  layersFor?(picture: Picture): readonly LayerVisibility[];
  /** Runs `render`, the picture's, with what the part needs around it (the scene lit for the picture's frame). */
  renderFor?<T>(picture: Picture, render: () => T): T;
  /** Keeps what `view` (the player window's frame) shows ready at its detail, until the returned function. */
  keepReady?(view: TesseraView): () => void;
}

/** A part of the GM's alone: no picture shows `layers`. */
export function hiddenFromPictures(layers: () => readonly (HideableLayer | null | undefined)[]): PicturePart {
  return {
    layersFor: () => layers().flatMap((layer) => (layer ? [{ layer, visible: false }] : [])),
  };
}
