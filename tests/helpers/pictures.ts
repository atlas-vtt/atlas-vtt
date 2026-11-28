import { PictureCapture, type PictureCaptureDeps, type PicturePartName } from '../../src/app/pixi/picture/PictureCapture';
import type { PicturePart, PlayersFrame } from '../../src/app/pixi/picture/picture';
import type { SceneFrame } from '../../src/app/pixi/lighting/engine/types';
import type { TesseraView } from '../../src/app/pixi/mosaicCanvas/levelOfDetail';
import { frameView } from '../../src/app/services/playerFrameDemand';
import type { AtlasSettings } from '../../src/app/services/SettingsService';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';

/** A map view's captures with `parts` alone: no camera to turn and nothing to render for the GM, unless `deps` gives them. */
export function picturesOf(parts: Partial<Record<PicturePartName, PicturePart>>, deps: Partial<PictureCaptureDeps> = {}): PictureCapture {
  const pictures = new PictureCapture({ camera: () => null, renderGmFrame: () => undefined, ...deps });
  for (const [name, part] of Object.entries(parts)) pictures.attach(name as PicturePartName, part);
  return pictures;
}

/** A picture of the scene of `frame`, taken with `parts` alone, and `render`'s result. */
export function scenePicture<T>(parts: Partial<Record<PicturePartName, PicturePart>>, frame: SceneFrame, render: () => T, view: TesseraView | null = null): T {
  return picturesOf(parts).capture({ kind: 'scene', frame, view }, render);
}

/** The players' frame of `frame` as a map view captures it, with `more` in place of what it would read. */
export function playersFrame(frame: PlayerFrame, more: { settings?: AtlasSettings['localPlayerView']; sight?: TokenPerception; renderFollows?: boolean } = {}): PlayersFrame {
  return { kind: 'players', frame, view: frameView(frame), settings: more.settings ?? ({ showTokenNameplates: true } as AtlasSettings['localPlayerView']), sight: more.sight, renderFollows: more.renderFollows ?? false };
}
