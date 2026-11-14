import { t } from '../../../../i18n';
import { assetNameFromFileName } from '../../../../services/assetImageFiles';
import { cropReset } from './cropMath';
import type { EditTokenInput, TokenPreview } from './types';

export function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** Cards show the converted image once it is ready, never the upload itself, which may be far too large to paint cheaply. */
export function previewFromFile(file: File): TokenPreview {
  const baseName = assetNameFromFileName(file.name);
  return {
    id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    file,
    previewUrl: '',
    name: baseName || t('creator.untitled'),
    ...cropReset({ file }),
    isSelected: true,
    isOptimizing: true,
  };
}

export function previewFromEdit(token: EditTokenInput): TokenPreview {
  return {
    id: token.id,
    tags: token.tags,
    showRing: token.showRing ?? true,
    ...(token.size !== undefined && { size: token.size }),
    file: null,
    previewUrl: token.imageUrl,
    name: token.name,
    ...cropReset({ file: null }),
    isSelected: true,
    isOptimizing: false,
  };
}

/** `previews` with the conversion results that had not reached the list yet; an image they replace is given back. */
export function withQueuedPatches(previews: readonly TokenPreview[], patches: ReadonlyMap<string, Partial<TokenPreview>>): TokenPreview[] {
  return previews.map((preview) => {
    const patch = patches.get(preview.id);
    if (!patch) return preview;
    if (patch.previewUrl) revokeIfBlob(preview.previewUrl);
    return { ...preview, ...patch };
  });
}
