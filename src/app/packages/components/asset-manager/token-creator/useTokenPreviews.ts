import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { convertForPreview } from './tokenImages';
import type { CreatorMode, EditTokenInput, PreviewImage, TokenPreview, TokenPreviewPatch } from './types';
import { t } from '../../../../i18n';
import { cropReset } from './cropMath';
import { useBatchProgress } from './useBatchProgress';
import type { ProgressCount } from '../../primitives/useLingeringTask';

/** What a background conversion produced: a framed token's default crop, or the whole image. */
export type PreviewConversionKind = 'default-crop' | 'whole';

export interface TokenPreviewsApi {
  previews: TokenPreview[];
  defaultRing: boolean;
  setAllRings: (showRing: boolean) => void;
  selectedIds: string[];
  addFiles: (files: File[]) => void;
  addImages: (images: PreviewImage[]) => void;
  toggleTag: (tag: string) => void;
  reset: (editToken?: EditTokenInput | null) => void;
  remove: (id: string) => void;
  /** Removes several previews in one list update, e.g. the ones a save just stored. */
  removeMany: (ids: readonly string[]) => void;
  removeSelected: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelected: (id: string) => void;
  update: (id: string, patch: TokenPreviewPatch) => void;
  updateSelected: (patch: TokenPreviewPatch) => void;
  /** The background conversion of this preview once it settles, if it produced `kind`. */
  waitForOptimized: (id: string, kind: PreviewConversionKind) => Promise<ProcessedImage | undefined>;
  /** How far the conversion of the images added last is, or null when none runs. */
  optimization: ProgressCount | null;
}

/**
 * Finished conversions reach the preview list at most this often. Each list
 * update renders the grid again, so with thousands of previews one update per
 * image made a large import crawl.
 */
const PATCH_FLUSH_MS = 150;

function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** Cards show the converted image once it is ready, never the upload itself, which may be far too large to paint cheaply. */
function previewFromFile(file: File): TokenPreview {
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
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

function previewFromEdit(token: EditTokenInput): TokenPreview {
  return {
    id: token.id,
    tags: token.tags,
    showRing: token.showRing ?? true,
    ...(token.size !== undefined && { size: token.size }),
    file: null,
    previewUrl: token.imageUrl,
    name: token.name,
    ...cropReset({ file: null, showRing: token.showRing ?? true }),
    isSelected: true,
    isOptimizing: false,
  };
}

interface PendingOptimization {
  result: Promise<ProcessedImage | undefined>;
  kind: PreviewConversionKind;
  controller: AbortController;
  settled: boolean;
}

/** A change of ring mode starts at that mode's default fit. */
function updatedPreview(preview: TokenPreview, patch: TokenPreviewPatch): TokenPreview {
  const next = { ...preview, ...patch };
  return patch.showRing !== undefined && patch.showRing !== (preview.showRing ?? true)
    ? { ...next, ...cropReset(next), ...patch }
    : next;
}

/**
 * Owns the preview list of the token creator: file intake, background
 * conversion, selection and per-preview edits. Uploads are converted in
 * parallel by the image workers and their results reach the list in batches;
 * removing a preview cancels its conversion. Blob URLs are revoked when a
 * preview is removed or on unmount.
 */
export function useTokenPreviews(mode: CreatorMode): TokenPreviewsApi {
  const [defaultRing, setDefaultRing] = useState(true);
  const [previews, setPreviews] = useState<TokenPreview[]>([]);
  const previewsRef = useRef(previews);
  const liveIds = useRef(new Set<string>());
  const changePreviews = useCallback((update: (current: TokenPreview[]) => TokenPreview[]): void => {
    const next = update(previewsRef.current);
    previewsRef.current = next;
    liveIds.current = new Set(next.map((p) => p.id));
    setPreviews(next);
  }, []);

  const pendingRef = useRef(new Map<string, PendingOptimization>());
  const { progress: optimization, start: startOptimizations, finish: finishOptimizations, drop: dropOptimization, clear: clearOptimizations } = useBatchProgress();

  // Finished conversions wait here until the next flush applies them in one list update.
  const queuedPatches = useRef(new Map<string, Partial<TokenPreview>>());
  const queuedFinishes = useRef(0);
  const flushTimer = useRef<number | null>(null);

  const flushQueued = useCallback((): void => {
    flushTimer.current = null;
    const patches = queuedPatches.current;
    const finished = queuedFinishes.current;
    queuedPatches.current = new Map();
    queuedFinishes.current = 0;
    if (finished > 0) finishOptimizations(finished);
    patches.forEach((patch, id) => { if (!liveIds.current.has(id) && patch.previewUrl) revokeIfBlob(patch.previewUrl); });
    if (![...patches.keys()].some((id) => liveIds.current.has(id))) return;
    changePreviews((prev) => prev.map((p) => {
      const patch = patches.get(p.id);
      if (!patch) return p;
      if (patch.previewUrl) revokeIfBlob(p.previewUrl);
      return { ...p, ...patch };
    }));
  }, [changePreviews, finishOptimizations]);

  const scheduleFlush = useCallback((): void => {
    flushTimer.current ??= window.setTimeout(flushQueued, PATCH_FLUSH_MS);
  }, [flushQueued]);

  const queuePatch = useCallback((id: string, patch: Partial<TokenPreview>): void => {
    const earlier = queuedPatches.current.get(id);
    if (earlier?.previewUrl && patch.previewUrl) revokeIfBlob(earlier.previewUrl);
    queuedPatches.current.set(id, { ...earlier, ...patch });
    scheduleFlush();
  }, [scheduleFlush]);

  const cancelOptimization = useCallback((id: string): void => {
    const pending = pendingRef.current.get(id);
    pendingRef.current.delete(id);
    if (!pending || pending.settled) return;
    pending.controller.abort();
    dropOptimization();
  }, [dropOptimization]);
  const cancelAllOptimizations = useCallback((): void => {
    pendingRef.current.forEach(pending => pending.controller.abort());
    pendingRef.current.clear();
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    flushTimer.current = null;
    queuedPatches.current.forEach((patch) => { if (patch.previewUrl) revokeIfBlob(patch.previewUrl); });
    queuedPatches.current.clear();
    queuedFinishes.current = 0;
    clearOptimizations();
  }, [clearOptimizations]);

  useEffect(() => () => {
    cancelAllOptimizations();
    previewsRef.current.forEach(p => revokeIfBlob(p.previewUrl));
    previewsRef.current = [];
  }, [cancelAllOptimizations]);

  const patchPreview = useCallback((id: string, patch: TokenPreviewPatch): void => {
    changePreviews((prev) => prev.map((p) => (p.id === id ? updatedPreview(p, patch) : p)));
  }, [changePreviews]);

  const optimizeOne = useCallback(async (preview: TokenPreview, framed: boolean, signal: AbortSignal): Promise<ProcessedImage | undefined> => {
    const { file } = preview;
    if (!file) return undefined;
    try {
      const result = await convertForPreview(file, mode, framed, signal);
      if (!signal.aborted && liveIds.current.has(preview.id)) {
        queuePatch(preview.id, {
          compressionRatio: Math.round((1 - result.image.size / file.size) * 100),
          scaledDown: result.scaledDown,
          previewUrl: URL.createObjectURL(result.sourcePreview ?? result.preview ?? result.image),
          isOptimizing: false,
        });
      }
      return result;
    } catch (error) {
      if (signal.aborted) return undefined;
      console.error(`[TokenCreator] Failed to optimize ${preview.name}:`, error);
      // Show the upload itself so the user can see which image failed.
      if (liveIds.current.has(preview.id)) queuePatch(preview.id, { previewUrl: URL.createObjectURL(file), isOptimizing: false });
      return undefined;
    }
  }, [mode, queuePatch]);

  const addImages = useCallback((images: PreviewImage[]): void => {
    // A statblock or a vault image is added once; the same key never names both.
    const sourceOf = (image: Pick<PreviewImage, 'statblockPath' | 'vaultPath'>): string | undefined => image.statblockPath ?? image.vaultPath;
    const paths = new Set(previewsRef.current.flatMap(p => sourceOf(p) ?? []));
    const fresh = images.filter(image => {
      const source = sourceOf(image);
      if (!image.file.type.startsWith('image/') || (source && paths.has(source))) return false;
      if (source) paths.add(source);
      return true;
    }).map(image => ({ ...previewFromFile(image.file), ...image, tags: image.tags ?? [], showRing: image.showRing ?? defaultRing }));
    if (fresh.length === 0) return;
    changePreviews((prev) => [...prev, ...fresh]);
    startOptimizations(fresh.length);
    for (const preview of fresh) {
      const controller = new AbortController();
      const framed = preview.showRing !== false;
      const pending: PendingOptimization = {
        controller, settled: false, kind: mode === 'token' && framed ? 'default-crop' : 'whole',
        result: optimizeOne(preview, framed, controller.signal),
      };
      void pending.result.finally(() => {
        pending.settled = true;
        if (controller.signal.aborted) return;
        queuedFinishes.current += 1;
        scheduleFlush();
      });
      pendingRef.current.set(preview.id, pending);
    }
  }, [mode, optimizeOne, defaultRing, changePreviews, startOptimizations, scheduleFlush]);

  const reset = useCallback((editToken?: EditTokenInput | null): void => {
    previewsRef.current.forEach((p) => revokeIfBlob(p.previewUrl));
    cancelAllOptimizations();
    setDefaultRing(editToken?.showRing ?? true);
    changePreviews(() => editToken?.imageUrl ? [previewFromEdit(editToken)] : []);
  }, [changePreviews, cancelAllOptimizations]);

  const removeMany = useCallback((ids: readonly string[]): void => {
    const removed = new Set(ids);
    changePreviews((prev) => {
      prev.filter((p) => removed.has(p.id)).forEach((p) => revokeIfBlob(p.previewUrl));
      return prev.filter((p) => !removed.has(p.id));
    });
    removed.forEach(cancelOptimization);
  }, [changePreviews, cancelOptimization]);

  const remove = useCallback((id: string): void => removeMany([id]), [removeMany]);

  const removeSelected = useCallback((): void => {
    removeMany(previewsRef.current.filter((p) => p.isSelected).map((p) => p.id));
  }, [removeMany]);

  const setAllSelected = useCallback((isSelected: boolean): void => {
    changePreviews((prev) => prev.map((p) => ({ ...p, isSelected })));
  }, [changePreviews]);

  const toggleSelected = useCallback((id: string): void => {
    changePreviews((prev) => prev.map((p) => (p.id === id ? { ...p, isSelected: !p.isSelected } : p)));
  }, [changePreviews]);

  const updateSelected = useCallback((patch: TokenPreviewPatch): void => {
    changePreviews((prev) => prev.map((p) => (p.isSelected ? updatedPreview(p, patch) : p)));
  }, [changePreviews]);

  const waitForOptimized = useCallback(async (id: string, kind: PreviewConversionKind): Promise<ProcessedImage | undefined> => {
    const pending = pendingRef.current.get(id);
    return pending?.kind === kind ? pending.result : undefined;
  }, []);

  const selectedIds = useMemo(() => previews.filter((p) => p.isSelected).map((p) => p.id), [previews]);

  return {
    previews,
    defaultRing,
    setAllRings: (showRing) => { setDefaultRing(showRing); changePreviews(current => current.map(p => updatedPreview(p, { showRing }))); },
    selectedIds,
    addFiles: files => addImages(files.map(file => ({ file }))),
    addImages,
    toggleTag: tag => changePreviews(current => {
      const remove = current.filter(p => p.isSelected).every(p => p.tags?.includes(tag));
      return current.map(p => p.isSelected ? { ...p, tags: remove ? (p.tags ?? []).filter(t => t !== tag) : [...new Set([...(p.tags ?? []), tag])] } : p);
    }),
    reset,
    remove,
    removeMany,
    removeSelected,
    selectAll: () => setAllSelected(true),
    deselectAll: () => setAllSelected(false),
    toggleSelected,
    update: patchPreview,
    updateSelected,
    waitForOptimized,
    optimization,
  };
}
