/**
 * The collection a statblock pane works for (§7.1). Notes are vault-wide and
 * the role is not in the note, so each pane works for one collection: the
 * entry point's, else the only collection whose tokens link the note, else
 * the default. It decides the role the header names and the roles offered for
 * a new statblock.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { StatblockRole } from '../model/roleTypes';
import type { TemplateId } from '../model/templateTypes';
import { collectionStatblockRoles } from '../roles/collectionStatblockRoles';

export interface CollectionChoice {
  id: string;
  name: string;
}

export interface CollectionContext {
  collectionId: string;
  /** Every collection, to switch to. */
  collections: readonly CollectionChoice[];
  /** The collections whose tokens link the note. */
  linking: readonly string[];
  /**
   * Whether the header shows the collection and offers to switch it: there is
   * more than one. Always the same for a note view and the template editor,
   * so their capsules match (§2.3); a linking collection only comes first.
   */
  switchable: boolean;
}

interface LinkingToken {
  collection: string;
  statblockPath?: string | undefined;
}

/** The collections whose tokens link the note at `notePath`, each once, in the order the tokens come. */
export function linkingCollectionIds(tokens: readonly LinkingToken[], notePath: string): string[] {
  return [...new Set(tokens.filter((token) => token.statblockPath === notePath).map((token) => token.collection))];
}

/** §7.1's order: the entry point's collection, else the only one whose tokens link the note, else `fallback`. */
export function chooseCollection(
  requested: string | null | undefined,
  known: ReadonlySet<string>,
  linking: readonly string[],
  fallback: string,
): string {
  if (requested && known.has(requested)) return requested;
  const [only] = linking.filter((id) => known.has(id));
  return linking.length === 1 && only !== undefined ? only : fallback;
}

/** The pane's collection context for a note, read from the asset index. */
export async function resolveCollectionContext(app: App, notePath: string, requested: string | null): Promise<CollectionContext> {
  const assets = AssetService.getInstance(app);
  const [collections, tokens] = await Promise.all([assets.getCollections(), assets.getAssets(undefined, 'token')]);
  const choices = collections.map(({ id, name }) => ({ id, name }));
  const linking = linkingCollectionIds(tokens, notePath);
  const collectionId = chooseCollection(requested, new Set(choices.map((choice) => choice.id)), linking, assets.getDefaultCollectionId());
  return { collectionId, collections: choices, linking, switchable: choices.length > 1 };
}

/** The roles of a collection, through its settings and the vault's presets. */
export function collectionRoles(app: App, collectionId: string, presets: readonly SystemPreset[]): readonly StatblockRole[] {
  return collectionStatblockRoles(AssetService.getInstance(app).getCollectionSettings(collectionId), presets);
}

/** The role the header names for a template: only when exactly one role of the collection uses it. */
export function roleNameFor(roles: readonly StatblockRole[], templateId: TemplateId): string | null {
  const using = roles.filter((role) => role.templateId === templateId);
  return using.length === 1 ? using[0]?.name ?? null : null;
}
