import type { ScaleDown } from '../../../../imageProcessing/imageJob';
import type { TokenImageSource } from '../../../../types/tokenImageSource';

export type CreatorMode = 'token' | 'map';

export interface EditTokenInput {
  showRing?: boolean;
  size?: number | undefined;
  id: string;
  name: string;
  imageUrl: string;
  imagePath?: string | undefined;
  imageSource?: TokenImageSource | undefined;
  sourceImageUrl?: string | undefined;
  tags: string[];
}

/** Offset of the image centre from the well centre, as a fraction of the well width. */
export interface ImagePosition {
  x: number;
  y: number;
}

export interface PreviewImage {
  file: File;
  tags?: string[];
  showRing?: boolean;
  size?: number | undefined;
  name?: string;
  statblockPath?: string;
  /** The vault image the preview was read from. */
  vaultPath?: string;
}

/** Where the creator takes images from: uploads, statblock art or images already in the vault. */
export type CreatorSource = 'images' | 'statblocks' | 'vault';

export interface TokenPreview {
  tags?: string[];
  statblockPath?: string;
  /** The vault image the preview was read from. */
  vaultPath?: string;
  showRing?: boolean;
  /** Default footprint saved on the asset; undefined keeps 1×1. */
  size?: number | undefined;
  id: string;
  /** Original upload; null when editing an existing asset without replacing its image. */
  file: File | null;
  /** Preserved source and the last saved framing when editing an existing token. */
  imageSource?: TokenImageSource;
  /** Percentage by which the background conversion shrank the upload. */
  compressionRatio?: number;
  /** Pixels the conversion took from an upload larger than Atlas keeps. */
  scaledDown?: ScaleDown | undefined;
  previewUrl: string;
  name: string;
  imageScale: number;
  imagePosition: ImagePosition;
  /** Framing in the other ring mode, saved with the source image. */
  alternateCrop?: { imageScale: number; imagePosition: ImagePosition };
  isSelected: boolean;
  isOptimizing: boolean;
}

export type TokenPreviewPatch = Partial<Pick<TokenPreview, 'name' | 'imageScale' | 'imagePosition' | 'showRing' | 'size' | 'tags'>>;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;

export function clampZoom(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}
