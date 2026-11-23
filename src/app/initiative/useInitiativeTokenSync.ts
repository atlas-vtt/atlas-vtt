import { useEffect } from 'react';
import { useAtlasStore, useViewStoreHook } from '../react/ViewStoreContext';
import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { entryToken } from './party';
import { initiativeEntryForToken } from '../stores/initiativeEntries';
import { offMapWithoutEntry } from './offMapCombatants';

/** Keeps the tracker's entries in step with their tokens while the tracker is mounted. */
export function useInitiativeTokenSync(tokens: Record<string, TokenEntity>, entries: InitiativeEntry[]): void {
  const removeFromInitiative = useAtlasStore((s) => s.removeFromInitiative);
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);
  const addToInitiative = useAtlasStore((s) => s.addToInitiative);
  const store = useViewStoreHook();
  const isMapLoading = useAtlasStore((s) => s.isMapLoading);

  // The entry of a deleted token goes with it; a party member's has none
  useEffect(() => {
    entries.forEach((entry) => {
      if (entry.tokenId !== undefined && !tokens[entry.tokenId]) {
        removeFromInitiative(entry.id);
      }
    });
  // Deliberately not keyed on the entries: checked only when map tokens change, not on entry edits.
  }, [tokens, removeFromInitiative]);

  // A combatant kept beside the map is shown by its entry alone: one an undo brought back without it is listed again
  useEffect(() => {
    if (isMapLoading) return;
    for (const token of offMapWithoutEntry(tokens, store.getState().initiative.entries)) addToInitiative(initiativeEntryForToken(token));
  }, [tokens, isMapLoading, store, addToInitiative]);

  // Entries follow their token's name, image and statblock; resources are read from the token itself
  useEffect(() => {
    entries.forEach((entry) => {
      const token = entryToken(tokens, entry);
      if (!token) return;

      const updates: Partial<InitiativeEntry> = {};

      if (entry.imagePath !== token.imagePath) {
        updates.imagePath = token.imagePath;
      }

      if (token.kind === 'character') {
        if (entry.name !== token.name) {
          updates.name = token.name;
        }

        const tokenStatblockPath = token.statblockPath?.trim() ? token.statblockPath : undefined;

        if (entry.statblockPath !== tokenStatblockPath) {
          updates.statblockPath = tokenStatblockPath;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateInitiativeEntry(entry.id, updates);
      }
    });
  }, [tokens, entries, updateInitiativeEntry]);
}

const NO_TOKENS: Record<string, TokenEntity> = {};

/** Keeps the entries in step with their tokens, drawn or not: the tracker itself reads tokens only while it is drawn. */
export function InitiativeTokenSync(): null {
  const tokens = useAtlasStore((s) => s.objects?.tokens) ?? NO_TOKENS;
  const entries = useAtlasStore((s) => s.initiative.entries);
  useInitiativeTokenSync(tokens, entries);
  return null;
}
