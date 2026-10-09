import type { Ticker } from 'pixi.js';
import type { TFile } from 'obsidian';
import type { TileReader } from './mapImageTiles';
import type { OpenedMap } from './TileDecoderClient';
import type { TileUploader } from './tileTextureCache';

/** What a scene shows under its tokens: a vault image, the missing-image placeholder, or nothing of a given size. */
export type MapImageSource =
  | { kind: 'file'; file: TFile }
  | { kind: 'placeholder' }
  | { kind: 'none'; width: number; height: number };

/** `image`: another image (or none) is shown, its world rect may differ; `albedo`: `albedoTexture()` became ready. */
export type MapImageChange = 'image' | 'albedo';

/** The part of `MapImageService` a map image opens and reads its file through. */
export interface MapImageOpener extends TileReader {
  open(file: TFile): Promise<OpenedMap>;
  reportUnshown(file: TFile, error: unknown): void;
  /** Called when the tile worker stopped and took the open maps along; returns the unsubscribe. */
  onRestart(listener: () => void): () => void;
}

/** The part of a pixi-viewport a map image reads its camera from and sets the world size of. */
export interface MapImageViewport {
  left: number;
  top: number;
  worldScreenWidth: number;
  worldScreenHeight: number;
  scale: { x: number };
  worldWidth: number;
  worldHeight: number;
}

export interface MapImageDeps {
  service: MapImageOpener;
  viewport: MapImageViewport;
  /** Runs the tile layer's updates and the texture uploads, once per frame. */
  ticker: Ticker;
  /** The renderer that draws the tiles; null uploads nothing ahead. */
  renderer: (TileUploader & { resolution: number }) | null;
  requestRender: () => void;
  /** Read when a tile appears: true draws it at once instead of fading it in. */
  drawAtOnce?: () => boolean;
  /** The size of the pictures of the whole map taken (thumbnails), whose tiles stay loaded. */
  picture?: { width: number; height: number };
}
