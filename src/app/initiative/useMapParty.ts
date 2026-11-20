import { useEffect, useMemo, useState } from 'react';
import { useMapRulesRevision } from '../react/hooks/useMapRulesRevision';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import type { PartyMember } from '../types/collectionSettingsTypes';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { mapParty } from './mapParty';
import { partyEntryChanges } from './party';

/** The party of the collection the view's map belongs to; follows edits to the collection's settings. */
export function useMapParty(): PartyMember[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  // The index loading and other changes; saves of the collection's settings while a campaign plays too
  const revision = useMapRulesRevision(app);
  const [settingsSaves, setSettingsSaves] = useState(0);
  useEffect(() => {
    if (!app) return;
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', () => setSettingsSaves((value) => value + 1));
    return () => app.workspace.offref(ref);
  }, [app]);

  return useMemo(
    () => (app ? mapParty(app, mapPath) : []),
    // `revision` and `settingsSaves` stand for the collection's settings and the asset index, which are read here.
    [app, mapPath, revision, settingsSaves],
  );
}

/** Keeps the party's entries showing the names and pictures the roster has now. */
export function usePartyEntrySync(party: readonly PartyMember[], entries: readonly InitiativeEntry[]): void {
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);
  useEffect(() => {
    for (const entry of entries) {
      const changes = partyEntryChanges(entry, party);
      if (changes) updateInitiativeEntry(entry.id, changes);
    }
  }, [party, entries, updateInitiativeEntry]);
}
