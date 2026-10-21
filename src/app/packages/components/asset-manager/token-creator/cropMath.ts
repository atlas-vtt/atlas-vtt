import type { FramePlacement } from '../../../../imageProcessing/imageProcessing';
import { frameImageRect } from '../../../../imageProcessing/imageLayout';
import type { ImagePosition, TokenPreview, TokenPreviewPatch } from './types';

/** Diameter of the circular token crop as a fraction of the well. Mirrors the 10% mask inset in _card.scss. */
export const TOKEN_CROP_FRACTION = 0.8;

/**
 * Zoom at which a whole image spans the crop circle. A ringed token shows its stored
 * image that way on the map, so editing one starts here.
 */
export const STORED_IMAGE_SCALE = TOKEN_CROP_FRACTION;

/**
 * Fresh uploads fill the well; a stored ringed image fits the crop circle.
 * Ringless images fit the whole well at their natural aspect ratio.
 */
export function cropReset(preview: Pick<TokenPreview, 'file' | 'showRing'>): Required<Pick<TokenPreviewPatch, 'imageScale' | 'imagePosition'>> {
  return { imageScale: preview.showRing === false || preview.file ? 1 : STORED_IMAGE_SCALE, imagePosition: { x: 0, y: 0 } };
}

export interface ImageAspect {
  width: number;
  height: number;
}

/** Image rectangle in well units (1 = well width), origin at the well's top-left. */
export interface RenderedImageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Where the image sits in the well: `scale` wide, natural aspect, centred plus the drag offset. */
export function renderedImageRect(scale: number, position: ImagePosition, aspect: ImageAspect | null, fit?: FramePlacement['fit']): RenderedImageRect {
  return frameImageRect(aspect ?? { width: 1, height: 1 }, {
    centerX: 0.5 + position.x, centerY: 0.5 + position.y, width: scale, ...(fit && { fit }),
  }, 1);
}

/**
 * Keeps the image covering the centre of the crop: at high zoom every part of
 * it can be dragged into the circle, and at any zoom it can never leave it.
 */
export function clampImagePosition(position: ImagePosition, scale: number, aspect: ImageAspect | null, fit?: FramePlacement['fit']): ImagePosition {
  const { width, height } = renderedImageRect(scale, position, aspect, fit);
  return { x: clamp(position.x, width / 2), y: clamp(position.y, height / 2) };
}

/**
 * Where the image sits in the square around the token circle, the area a
 * token image keeps: `renderedImageRect` expressed in units of that square.
 */
export function tokenCropPlacement(scale: number, position: ImagePosition, framed = true): FramePlacement {
  const fraction = framed ? TOKEN_CROP_FRACTION : 1;
  const cropOrigin = (1 - fraction) / 2;
  const { left, top, width, height } = renderedImageRect(scale, position, null);
  return {
    centerX: (left + width / 2 - cropOrigin) / fraction,
    centerY: (top + height / 2 - cropOrigin) / fraction,
    width: width / fraction,
    ...(!framed && { fit: 'contain' as const }),
  };
}
