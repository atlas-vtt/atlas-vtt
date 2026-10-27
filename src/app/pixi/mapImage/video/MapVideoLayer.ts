import { Sprite, Texture, VideoSource } from 'pixi.js';
import { destroyTree } from '../../utils/destroyTree';
import type { MapVideoMode } from './mapVideoPlayback';
import type { OpenedVideo } from './videoElement';

/**
 * Draws an animated map's video over its still tiles: one sprite of the image's size, in the
 * image's own pixels, so the alignment's stretch and turn apply to it as to the tiles. Its
 * texture is updated once per decoded frame (`requestVideoFrameCallback`), never per display
 * frame, and each update asks for a render, which the render scheduler cannot see by itself:
 * a 30 fps map costs 30 renders a second, a paused one none.
 */
export class MapVideoLayer {
  readonly sprite: Sprite;
  private readonly source: VideoSource;
  private frameRequest: number | null = null;
  private mode: MapVideoMode = 'pause';
  private destroyed = false;

  constructor(
    private readonly video: OpenedVideo,
    size: { width: number; height: number },
    private readonly requestRender: () => void,
  ) {
    // The element has its first frame already, so its size is known. Not loaded by PIXI: its load
    // only waits for that and, should the layer go meanwhile, rejects unhandled.
    this.source = new VideoSource({ resource: video.element, autoPlay: false, autoLoad: false, alphaMode: 'premultiply-alpha-on-upload' });
    // The constructor always starts it updating itself; the frames are driven here instead.
    this.source.autoUpdate = false;
    this.sprite = new Sprite({ texture: new Texture({ source: this.source }), label: 'map-video', eventMode: 'none' });
    this.sprite.setSize(size.width, size.height);
    this.sprite.visible = false;
  }

  /** Lays the video over an image of `size` pixels. */
  setSize(size: { width: number; height: number }): void {
    this.sprite.setSize(size.width, size.height);
  }

  setMode(mode: MapVideoMode): void {
    if (this.destroyed) return;
    this.mode = mode;
    this.sprite.visible = mode !== 'poster';
    const { element } = this.video;
    if (mode === 'play') {
      this.watchFrames();
      element.play().catch((error: unknown) => {
        // A pause or a new source while starting rejects the play; that is no failure.
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('[MapImage] A map video could not play:', error);
      });
    } else {
      element.pause();
      this.stopWatching();
    }
    this.source.update();
    this.requestRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopWatching();
    const texture = this.sprite.texture;
    destroyTree(this.sprite);
    // The texture and its source are this layer's own; the source pauses the element as it goes.
    texture.destroy(true);
    this.video.release();
  }

  private watchFrames(): void {
    if (this.frameRequest === null) this.frameRequest = this.video.element.requestVideoFrameCallback(this.onFrame);
  }

  private stopWatching(): void {
    if (this.frameRequest === null) return;
    this.video.element.cancelVideoFrameCallback(this.frameRequest);
    this.frameRequest = null;
  }

  private readonly onFrame = (): void => {
    this.frameRequest = null;
    if (this.destroyed) return;
    this.source.update();
    this.requestRender();
    if (this.mode === 'play') this.watchFrames();
  };
}
