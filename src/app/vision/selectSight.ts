import type { TokenEntity } from '../types';
import { NO_SIGHT, type Sight } from './sight';
import { visionOn, type SightPolicy } from './tokenSightPolicy';

/**
 * The part of `sight` that `policy` sees through, without tracing again: the regions of tokens it lets give sight.
 * `sight` must have been worked out from at least those tokens (the GM's sight). One that sees all (token vision
 * off, or no token with vision at all) is returned as it is, and so is `sight` while every token with vision on
 * gives sight; one whose every region is dropped is `NO_SIGHT`.
 */
export function selectSight(sight: Sight, tokens: Record<string, TokenEntity>, policy: SightPolicy): Sight {
  if (sight.all) return sight;
  if (Object.values(tokens).every((token) => !visionOn(token) || policy.givesSight(token))) return sight;
  const regions = sight.regions.filter((region) => {
    const token = tokens[region.tokenId];
    return token !== undefined && policy.givesSight(token);
  });
  if (regions.length === sight.regions.length) return sight;
  return regions.length > 0 ? { all: false, regions } : NO_SIGHT;
}
