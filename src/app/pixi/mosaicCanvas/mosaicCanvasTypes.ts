import type { Ticker } from 'pixi.js';
import type { TFile } from 'obsidian';
import type { TesseraReader } from './mosaicCanvasTesserae';
import type { OpenedMap } from './TesseraDecoderClient';
import type { TesseraUploader } from './tesseraTextureCache';
import type { MapVideoDeps } from './video/MapVideoSlot';

/**
 * What a scene shows under its tokens: a vault image, a vault video (an animated map: its first
 * frame is the image, the video plays over it), the missing-image placeholder, or nothing of a given size.
 */
export type MosaicCanvasSource =
  | { kind: 'file'; file: TFile }
  | { kind: 'video'; file: TFile }
  | { kind: 'placeholder' }
  | { kind: 'none'; width: number; height: number };

/** The part of `MosaicCanvasService` a map image opens and reads its file through. */
export interface MosaicCanvasOpener extends TesseraReader {
  open(file: TFile): Promise<OpenedMap>;
  reportUnshown(file: TFile, error: unknown): void;
  /** Called when the tessera worker stopped and took the open maps along; returns the unsubscribe. */
  onRestart(listener: () => void): () => void;
}

/** The part of a pixi-viewport a map image reads its camera from and sets the world size of. */
export interface MosaicCanvasViewport {
  left: number;
  top: number;
  worldScreenWidth: number;
  worldScreenHeight: number;
  scale: { x: number };
  worldWidth: number;
  worldHeight: number;
}

export interface MosaicCanvasDeps {
  service: MosaicCanvasOpener;
  viewport: MosaicCanvasViewport;
  /** Runs the tessera layer's updates and the texture uploads, once per frame. */
  ticker: Ticker;
  /** The renderer that draws the tesserae; null uploads nothing ahead. */
  renderer: (TesseraUploader & { resolution: number }) | null;
  requestRender: () => void;
  /** Read when a tessera appears: true draws it at once instead of fading it in. */
  drawAtOnce?: () => boolean;
  /** The size of the pictures of the whole map taken (thumbnails), whose tesserae stay loaded. */
  picture?: { width: number; height: number };
  /** Plays animated maps; without it a video map shows its first frame. */
  video?: MapVideoDeps;
}
