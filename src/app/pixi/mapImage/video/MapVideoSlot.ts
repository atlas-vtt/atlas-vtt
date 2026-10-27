import { Container } from 'pixi.js';
import type { TFile } from 'obsidian';
import { destroyTree } from '../../utils/destroyTree';
import { MapVideoLayer } from './MapVideoLayer';
import type { MapVideoMode } from './mapVideoPlayback';
import type { OpenedVideo } from './videoElement';

/** Why an animated map shows its poster only. */
export type MapVideoProblem =
  | { kind: 'too-large'; width: number; height: number; maxSide: number }
  | { kind: 'unplayable'; error: unknown };

/** What a map image plays its videos through. */
export interface MapVideoDeps {
  /** Reads the file and makes its video in the view's document. */
  open(file: TFile): Promise<OpenedVideo>;
  /** The largest texture side the view's renderer draws; null where it draws no video (Canvas 2D). */
  maxTextureSize(): number | null;
  /** Tells the GM, once per file and session, why the map shows its first frame only. */
  reportStill(file: TFile, problem: MapVideoProblem): void;
}

interface Shown {
  file: TFile;
  key: string;
  size: { width: number; height: number };
  layer: MapVideoLayer | null;
  /** `still`: it cannot play here and is not tried again until another map is shown. */
  state: 'idle' | 'opening' | 'ready' | 'still';
}

function noop(): void {}

/**
 * The video of the animated map a map image shows, if any, in `container` above its tiles. The
 * video is opened only once it plays; until then the poster beneath it shows.
 */
export class MapVideoSlot {
  readonly container = new Container({ label: 'map-video', eventMode: 'none', interactiveChildren: false });
  private shown: Shown | null = null;
  private mode: MapVideoMode = 'pause';

  constructor(private readonly deps: MapVideoDeps | undefined, private readonly requestRender: () => void) {}

  /** Plays `file` over an image of `size` pixels; null shows none. The same file again keeps its video. */
  show(file: TFile | null, size: { width: number; height: number }): void {
    const key = file ? `${file.path}|${file.stat.size}|${file.stat.mtime}` : null;
    if (key !== null && this.shown?.key === key) {
      this.shown.size = size;
      this.shown.layer?.setSize(size);
      return;
    }
    this.clear();
    if (!file || key === null || !this.deps) return;
    this.shown = { file, key, size, layer: null, state: 'idle' };
    this.openIfWanted();
  }

  setMode(mode: MapVideoMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.shown?.layer?.setMode(mode);
    this.openIfWanted();
  }

  /** Hides the video for one render of a picture of the scene (a thumbnail), which shows the poster; returns what shows it again. */
  hideFor(): () => void {
    const sprite = this.shown?.layer?.sprite;
    if (!sprite?.visible) return noop;
    sprite.visible = false;
    return (): void => {
      if (!sprite.destroyed) sprite.visible = true;
    };
  }

  clear(): void {
    const layer = this.shown?.layer;
    this.shown = null;
    if (!layer) return;
    layer.destroy();
    this.requestRender();
  }

  destroy(): void {
    this.clear();
    destroyTree(this.container);
  }

  private openIfWanted(): void {
    const shown = this.shown;
    const deps = this.deps;
    // Opened once it plays: a scene loaded in a hidden view, or with animation off, reads only its poster.
    if (!shown || !deps || shown.state !== 'idle' || this.mode !== 'play') return;
    shown.state = 'opening';
    deps.open(shown.file).then(
      (video) => {
        if (this.shown === shown) this.attach(shown, video, deps);
        else video.release();
      },
      (error: unknown) => {
        if (this.shown !== shown) return;
        shown.state = 'still';
        deps.reportStill(shown.file, { kind: 'unplayable', error });
      },
    );
  }

  private attach(shown: Shown, video: OpenedVideo, deps: MapVideoDeps): void {
    const maxSide = deps.maxTextureSize();
    const { videoWidth: width, videoHeight: height } = video.element;
    if (maxSide === null || width > maxSide || height > maxSide) {
      video.release();
      shown.state = 'still';
      if (maxSide !== null) deps.reportStill(shown.file, { kind: 'too-large', width, height, maxSide });
      return;
    }
    const layer = new MapVideoLayer(video, shown.size, this.requestRender);
    shown.layer = layer;
    shown.state = 'ready';
    this.container.addChild(layer.sprite);
    layer.setMode(this.mode);
  }
}
