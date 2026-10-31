import type { AnyAsset } from '../types';
import { useMapProcessingLookup } from '../components/mapProcessingContext';
import { useProcessingPercent, useSceneImagePaths } from '../../shared/useMapProcessing';

/**
 * Whole percent of how far the map image a card shows is processed, or null while it is not: a
 * map's image, or the first of a scene's images being processed. Each card renders again only when
 * its own number changes.
 */
export function useAssetProcessing(asset: AnyAsset): number | null {
  const lookup = useMapProcessingLookup();
  const processing = lookup?.processing ?? null;
  const scenePaths = useSceneImagePaths(lookup?.app ?? null, processing, asset.type === 'scenes' ? asset.scenePath ?? null : null);
  const paths = asset.type === 'maps' ? [asset.mapFilePath] : asset.type === 'scenes' ? scenePaths : [];
  return useProcessingPercent(processing, paths);
}
