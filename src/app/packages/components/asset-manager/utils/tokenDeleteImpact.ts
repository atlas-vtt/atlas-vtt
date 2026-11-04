import { App, TFile } from 'obsidian';
import { groupTokenRefs, type AssetService, type GroupAsset } from '../../../../services/AssetService';
import { findTokenPlacements, removeTokenPlacements } from '../../../../services/tokenAssetPlacements';
import type { AnyAsset } from '../types';
import { t } from '../../../../i18n';

/** Where the token assets about to be deleted are still in use. */
export interface TokenDeleteImpact {
  groups: GroupAsset[];
  maps: TFile[];
  tokenIds: string[];
  imagePaths: string[];
}

function listNames(names: string[]): string {
  const shown = names.slice(0, 5).map((n) => t('common.quoted', { name: n })).join(', ');
  return names.length > 5 ? t('am.impact.more', { names: shown, count: names.length - 5 }) : shown;
}

/** Looks up encounters and maps that use any of the given token assets. */
export async function findTokenDeleteImpact(
  app: App,
  assetService: AssetService,
  assets: AnyAsset[],
): Promise<TokenDeleteImpact> {
  const tokens = assets.filter((a) => a.type === 'tokens');
  const tokenIds = tokens.map((t) => t.id);
  const imagePaths = tokens.flatMap((t) => (t.imagePath ? [t.imagePath] : []));
  const [groups, maps] = await Promise.all([
    assetService.getGroupsUsingTokens(tokenIds),
    findTokenPlacements(app, imagePaths),
  ]);
  return { groups, maps, tokenIds, imagePaths };
}

/** Extra confirm-dialog paragraphs describing what else the deletion touches. */
export function describeTokenDeleteImpact(impact: TokenDeleteImpact): string[] {
  const ids = new Set(impact.tokenIds);
  const paragraphs: string[] = [];
  if (impact.groups.length > 0) {
    const emptied = impact.groups.filter((g) => groupTokenRefs(g).every((ref) => ids.has(ref.id)));
    paragraphs.push(t('am.impact.encounters', { count: impact.groups.length, names: listNames(impact.groups.map((g) => g.name)) }));
    if (emptied.length > 0) {
      paragraphs.push(t('am.impact.emptied', { names: listNames(emptied.map((g) => g.name)) }));
    }
  }
  if (impact.maps.length > 0) {
    paragraphs.push(t('am.impact.maps', { count: impact.maps.length, names: listNames(impact.maps.map((m) => m.basename)) }));
  }
  return paragraphs;
}

/** Removes map placements before the asset image is trashed. Encounter cleanup happens in the asset service. */
export function applyTokenDeleteImpact(app: App, impact: TokenDeleteImpact): Promise<void> {
  return removeTokenPlacements(app, impact.maps, impact.imagePaths);
}
