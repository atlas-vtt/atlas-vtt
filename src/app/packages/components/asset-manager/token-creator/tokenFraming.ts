import type { TokenImageCrop, TokenImageSource } from '../../../../types/tokenImageSource';
import { cropReset } from './cropMath';
import type { EditTokenInput, TokenPreview } from './types';

/** Restores framing against the source rather than treating the last render as fresh artwork. */
export function previewFromEdit(token: EditTokenInput): TokenPreview {
  const source = token.imageSource;
  return {
    id: token.id, tags: token.tags, showRing: token.showRing ?? true,
    ...(token.size !== undefined && { size: token.size }),
    file: null, previewUrl: source ? token.sourceImageUrl ?? '' : token.imageUrl, name: token.name,
    ...(source ? {
      imageSource: source,
      ...(token.showRing === false ? source.unframed : source.framed),
      alternateCrop: token.showRing === false ? source.framed : source.unframed,
    } : cropReset({ file: null, showRing: token.showRing ?? true })),
    isSelected: true, isOptimizing: false,
  };
}

/** Stores both ring modes against the same source, so toggling never crops a previous render. */
export function imageSourceFor(preview: TokenPreview, path: string): TokenImageSource {
  const active: TokenImageCrop = { imageScale: preview.imageScale, imagePosition: { ...preview.imagePosition } };
  const alternate = preview.alternateCrop ?? cropReset({ ...preview, showRing: preview.showRing === false });
  return {
    path,
    ringedDefaultScale: cropReset({ ...preview, showRing: true }).imageScale,
    framed: preview.showRing === false ? alternate : active,
    unframed: preview.showRing === false ? active : alternate,
  };
}

export function sameCrop(a: TokenImageCrop, b: TokenImageCrop): boolean {
  return a.imageScale === b.imageScale && a.imagePosition.x === b.imagePosition.x && a.imagePosition.y === b.imagePosition.y;
}
