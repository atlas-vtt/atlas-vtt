import { TFile, type App } from 'obsidian';
import { bestiaryLookup, resolveLinkedCreature } from '../creatures/linkedCreature';
import type { ViewAtlasStore } from '../storeFactory';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import type { TokenEntity } from '../types';
import { statblockInitiativeModifier } from './statblockModifiers';

/** Linking a plain token adds its statblockPath without changing its kind. */
const noteOf = (token: TokenEntity | undefined): string | undefined =>
  token && 'statblockPath' in token && typeof token.statblockPath === 'string'
    ? token.statblockPath.trim() || undefined : undefined;

/**
 * Reads the current linked statblocks before rolling, once per note even for a group.
 * Modifiers are used for this roll only, so unlinking never leaves a cached bonus behind.
 * A pending read must not roll into a different scene or a changed list of combatants.
 */
export async function rollWithStatblocks(
  app: App | null | undefined,
  store: ViewAtlasStore,
  rules: InitiativeRules,
  entryId?: string,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const before = store.getState();
  const entries = entryId === undefined ? before.initiative.entries : before.initiative.entries.filter((entry) => entry.id === entryId);
  if (!entries.length || before.isMapLoading) return;
  const paths = [...new Set(entries.map((entry) => noteOf(before.objects.tokens[entry.tokenId])).filter((path): path is string => Boolean(path)))];
  const modifiers = new Map<string, number>();

  if (app && paths.length) {
    const bestiary = bestiaryLookup();
    const records = new Map(await Promise.all(paths.map(async (path) => {
      const creature = await resolveLinkedCreature(app, path, bestiary);
      const file = app.vault.getAbstractFileByPath(path);
      const frontmatter = file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
      return [path, { ...creature, ...frontmatter }] as const;
    })));
    for (const entry of entries) {
      const path = noteOf(before.objects.tokens[entry.tokenId]);
      if (path) modifiers.set(entry.id, statblockInitiativeModifier(records.get(path) ?? {}, rules.modifierField));
    }
  }

  const current = store.getState();
  if (!isCurrent() || current.mapPath !== before.mapPath || current.isMapLoading
    || current.initiative.entries !== before.initiative.entries
    || entries.some((entry) => current.objects.tokens[entry.tokenId] !== before.objects.tokens[entry.tokenId])) return;

  if (entryId === undefined) {
    if (modifiers.size) current.rollAllInitiative(rules.roll, modifiers);
    else current.rollAllInitiative(rules.roll);
  } else if (modifiers.has(entryId)) current.rollEntryInitiative(entryId, rules.roll, modifiers.get(entryId));
  else current.rollEntryInitiative(entryId, rules.roll);
}
