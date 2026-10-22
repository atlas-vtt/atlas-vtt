/**
 * Linked tokens on an open map following their statblock after it changed (§11, token sync).
 * The statblock is read through the resolver, so renamed keys and a template's meanings count;
 * the changes are no edit of the map's and never become an undo step. Tokens also follow a
 * change of their art's link (`applyLinkChange`).
 */

import { difficultyLabel, statblockDisplayName } from '../../creatures/statblockRating';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { LinkChangeEvent } from '../../services/TokenStatblockLinkService';
import { syncedResources, type StatblockFields } from '../../resources/statblockResourceSync';
import { NO_MEANINGS } from '../../statblocks/resolve/fieldMeanings';
import type { ViewAtlasStore } from '../../storeFactory';
import type { TokenUpdates } from '../../types/viewState';
import { runUntracked } from '../../stores/history';
import type { TokenEntity } from '../../types';
import { STATBLOCK_UNLINK_UPDATES } from './statblockFrontmatter';
import { sceneTokens } from '../../tokens/offMap';

export type TokenChanges = Array<{ id: string; changes: TokenUpdates }>;

/**
 * What each token linked to the statblock takes from it: its name, its rating, the maxima of
 * its resources (current values kept and clamped, hand-set maxima left alone) and its image.
 * Tokens already in step get no entry.
 */
export function statblockTokenChanges(
  tokens: Readonly<Record<string, TokenEntity>>,
  statblockPath: string,
  statblock: StatblockFields,
  definitions: readonly ResourceDefinition[],
  image: string | null,
): TokenChanges {
  const meanings = statblock.meanings ?? NO_MEANINGS;
  const name = statblockDisplayName(statblock.fields, meanings);
  const difficulty = difficultyLabel(statblock.fields, meanings);
  const entries: TokenChanges = [];
  for (const [id, token] of Object.entries(tokens)) {
    if (token.kind !== 'character' || token.statblockPath !== statblockPath) continue;
    const changes: TokenUpdates = {};
    if (name !== null && name !== token.name) changes.name = name;
    const resources = syncedResources(token, statblock.fields, definitions, meanings);
    if (JSON.stringify(resources) !== JSON.stringify(token.resources ?? {})) changes.resources = resources;
    if (difficulty !== undefined && difficulty !== token.difficulty) changes.difficulty = difficulty;
    if (image && token.imagePath !== image) changes.imagePath = image;
    if (Object.keys(changes).length > 0) entries.push({ id, changes });
  }
  return entries;
}

/** Brings the map's linked tokens in step with their statblock, untracked: a statblock edit is not the map's undo step. */
export function syncLinkedTokens(
  store: ViewAtlasStore,
  statblockPath: string,
  statblock: StatblockFields,
  definitions: readonly ResourceDefinition[],
  image: string | null,
): void {
  const entries = statblockTokenChanges(sceneTokens(store.getState().objects), statblockPath, statblock, definitions, image);
  if (entries.length > 0) runUntracked(store, () => store.getState().updateTokens(entries));
}

/** What a token freshly linked to the statblock takes from it; null when the statblock cannot be read. */
export type LinkUpdates = (token: TokenEntity, statblockPath: string) => TokenUpdates | null;

/**
 * The open map's tokens with the art whose link changed follow it in one write: a link starts
 * their statblock values, an unlink clears them. A change a statblock note's image caused
 * (`fromNote`) is no edit of the map's and never becomes an undo step.
 */
export function applyLinkChange(store: ViewAtlasStore, event: LinkChangeEvent, linkUpdates: LinkUpdates): void {
  const entries: TokenChanges = [];
  for (const [id, token] of Object.entries(sceneTokens(store.getState().objects))) {
    if (token.imagePath !== event.tokenImagePath) continue;
    const changes = event.type === 'unlinked'
      ? STATBLOCK_UNLINK_UPDATES
      : event.statblockPath ? linkUpdates(token, event.statblockPath) : null;
    if (changes) entries.push({ id, changes });
  }
  if (entries.length === 0) return;
  const write = (): void => store.getState().updateTokens(entries);
  if (event.fromNote) runUntracked(store, write);
  else write();
}
