import { CanvasRenderer, Container, RenderTexture, Sprite, Texture, TexturePool, uid, WebGLRenderer, type Renderer } from 'pixi.js';
import type { FramePiece, PlayerFrame, Size } from '../types/playerFrame';
import { contextLost } from './lighting/engine/gpu';

/**
 * Most pieces a frame is brought across in. Each piece is a render of its own on the view's
 * canvas and a `drawImage`, and their number is the frame's area over the canvas': a pane
 * dragged almost shut would take hundreds for one frame, on every render of the GM's (216 for a
 * 2560 × 1440 frame from a pane of 1200 × 20, which no longer held 60 frames a second where up
 * to 45 did). `playerFrame` sizes a frame to stay within it; a frame that would take more is
 * not brought across at all.
 */
export const MAX_FRAME_PIECES = 16;

/** The pieces a frame of `frame`'s pixels is brought across in through a canvas of `canvas`' pixels. */
export function framePieces(frame: Size, canvas: Size): number {
  return Math.ceil(frame.width / canvas.width) * Math.ceil(frame.height / canvas.height);
}

/** What a piece is drawn over: the canvas shows a texel's colour as it is, like a frame rendered on it. */
const OPAQUE_BLACK: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Renders the players' frame at a size of its own with a map view's renderer, and hands out its
 * pixels.
 *
 * The canvas has the pane's size, so a frame of the player window's size cannot be rendered on
 * it. It is rendered into a texture instead (`render`), and one context cannot draw on a second
 * canvas, so the texture reaches the players' canvas through the view's own: `copy` draws it
 * there in pieces of the canvas' size, texel on pixel, and hands each piece out to be copied
 * with `drawImage` before the next is drawn. Reading the texture back instead would stall the
 * main thread for as long as the pixels take (22 ms for 3840 × 2160), and a canvas resized for
 * the copy allocates its drawing buffer twice a frame.
 *
 * `copy` leaves the last piece on the canvas: whoever calls it renders the canvas' own frame in
 * the same task, before the browser shows it.
 *
 * The lighting composite reads the scene beneath it by copy in a texture (as in a thumbnail), so
 * the frame does not go through the canvas' back buffer; the pieces are drawn past it too.
 */
export class PlayerFrameTexture {
  private texture: RenderTexture | null = null;
  /**
   * The texture holds the frame `render` was just asked for, and nobody was handed it yet. Only
   * such a frame is handed out: after a render that failed or drew nothing the texture still
   * holds the frame before, which may be of another moment, camera or scene.
   */
  private fresh = false;
  private readonly piece = new Sprite();
  private readonly holder = new Container();
  /** The frame's size, registered as a screen of its own: PIXI's texture pool then gives a filter of the frame textures of that size, not of the next power of two. */
  private readonly screenId = uid('renderer');
  // A restored context starts without the texture's pixels
  private readonly contextListener = { contextChange: (): void => this.release() };

  constructor(private readonly renderer: Renderer) {
    this.holder.addChild(this.piece);
    renderer.runners.contextChange.add(this.contextListener);
  }

  /** Whether a frame can be rendered now; not while the graphics context is lost. */
  canRender(): boolean {
    return !contextLost(this.renderer);
  }

  /** Renders `stage` as it stands into a texture of the frame's size. */
  render(stage: Container, frame: PlayerFrame): void {
    this.fresh = false;
    // PIXI renders nothing of a container that is not visible, and says nothing
    if (!stage.visible) return;
    const texture = this.textureFor(frame);
    this.renderer.render({ container: stage, target: texture, clear: true, clearColor: this.renderer.background.colorRgba });
    this.fresh = true;
  }

  /** Hands the frame just rendered to `copy`, piece by piece, once; nothing where no frame was rendered since the last copy. */
  copy(copy: (piece: FramePiece) => void): void {
    const { texture, renderer } = this;
    if (!texture || !this.fresh) return;
    this.fresh = false;
    // A lost context draws nothing: its canvas would hand out pieces without a picture
    if (!this.canRender()) return;
    const { pixelWidth: width, pixelHeight: height } = texture.source;
    if (renderer instanceof CanvasRenderer) {
      // A Canvas 2D render texture is a canvas of its own
      const { canvas } = renderer.renderTarget.getGpuRenderTarget(renderer.renderTarget.getRenderTarget(texture));
      if (canvas instanceof HTMLCanvasElement) copy({ image: canvas, x: 0, y: 0, width, height, left: 0, top: 0 });
      return;
    }
    const { canvas, resolution } = renderer;
    // A canvas without pixels has no piece to offer, and one too small for the frame would offer too many
    if (canvas.width < 1 || canvas.height < 1) return;
    if (framePieces({ width, height }, canvas) > MAX_FRAME_PIECES) return;
    const backBuffer = renderer instanceof WebGLRenderer ? renderer.backBuffer : null;
    const throughBackBuffer = backBuffer?.useBackBuffer ?? false;
    if (backBuffer) backBuffer.useBackBuffer = false;
    this.piece.texture = texture;
    // A texel of the frame to a pixel of the canvas, whatever pixels each has to a point
    this.piece.scale.set(texture.source.resolution / resolution);
    try {
      for (let top = 0; top < height; top += canvas.height) {
        for (let left = 0; left < width; left += canvas.width) {
          this.piece.position.set(-left / resolution, -top / resolution);
          renderer.render({ container: this.holder, clear: true, clearColor: OPAQUE_BLACK });
          if (!this.canRender()) return;
          copy({ image: canvas, x: 0, y: 0, width: Math.min(canvas.width, width - left), height: Math.min(canvas.height, height - top), left, top });
        }
      }
    } finally {
      if (backBuffer) backBuffer.useBackBuffer = throughBackBuffer;
    }
  }

  /**
   * Gives the frame's graphics memory back: its texture, and the textures of its size that PIXI's
   * pool kept for a filter of the frame (the lighting composite's), which go with the frame's
   * screen. The next frame makes them anew.
   *
   * What the pool rounded to a power of two instead (a lit area smaller than the frame) stays in
   * it, as the view's own such textures do: the pool is shared and hands them out again, so they
   * do not add up. Clearing the pool would take the view's idle filter textures too, while its
   * filter still holds them.
   */
  release(): void {
    this.fresh = false;
    this.piece.texture = Texture.EMPTY;
    this.texture?.destroy(true);
    this.texture = null;
    TexturePool.removeScreen(this.screenId);
  }

  destroy(): void {
    this.renderer.runners.contextChange.remove(this.contextListener);
    this.release();
    this.holder.destroy({ children: true });
  }

  private textureFor({ width, height, resolution, antialias }: PlayerFrame): RenderTexture {
    const current = this.texture?.source;
    if (this.texture && current?.pixelWidth === width && current.pixelHeight === height && current.resolution === resolution && current.antialias === antialias) {
      return this.texture;
    }
    this.release();
    // Nearest: a piece is drawn texel on pixel, and nothing may be averaged across a piece's edge
    this.texture = RenderTexture.create({ width: width / resolution, height: height / resolution, resolution, antialias, scaleMode: 'nearest' });
    TexturePool.setScreenSize(this.screenId, width, height);
    return this.texture;
  }
}
