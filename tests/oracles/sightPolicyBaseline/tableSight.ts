// Frozen from 8b3ddf049d7ad45e70beac62500d80e8bead30fd src/app/vision/tableSight.ts. Only import paths are adapted.
import type { TokenEntity } from '../../../src/app/types';
import { NO_SIGHT, type Sight } from './sight';
import { gmSightSource, tableSightSource } from './tokenSightPolicy';

/** Selects the player regions from already computed GM sight, without tracing another ray. */
export function tableSight(sight: Sight, tokens: Record<string, TokenEntity>): Sight {
  // All means either token vision is off or there is no vision token at all.
  if (sight.all) return sight;
  if (!Object.values(tokens).some(token => token.isHidden && gmSightSource(token))) return sight;
  const regions = sight.regions.filter(region => {
    const token = tokens[region.tokenId];
    return token !== undefined && tableSightSource(token);
  });
  if (regions.length === sight.regions.length) return sight;
  return regions.length > 0 ? { all: false, regions } : NO_SIGHT;
}
