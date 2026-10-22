import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { defaultEncounterName, storeEncounter, updateEncounter, type EncounterTokenDraft } from '../../../../encounters/encounterSaveService';
import { resourceUrl } from '../utils/assetFormatters';
import type { EncounterAsset, TokenAsset } from '../types';
import { encounterDrafts, picksFromEncounter, type EncounterPick } from './encounterPicks';

export interface EncounterDraft {
  picks: EncounterPick[];
  setPicks: Dispatch<SetStateAction<EncounterPick[]>>;
  name: string;
  setName: (name: string) => void;
  /** The name the encounter gets while none is typed. */
  defaultName: string;
  saving: boolean;
  /** Saves a new encounter, or the edited one in its place; resolves with whether it was saved. */
  save: () => Promise<boolean>;
}

/** A creature of a saved encounter the collection does not list (a token saved from a map, one without a statblock), from its reference. */
function tokenOfRef(app: App, ref: EncounterTokenDraft): TokenAsset {
  return {
    id: ref.id,
    name: ref.name,
    type: 'tokens',
    tags: [],
    folderId: null,
    modifiedAt: 0,
    imageUrl: resourceUrl(app, ref.imagePath),
    imagePath: ref.imagePath,
    ...(ref.size !== undefined && { size: ref.size }),
    ...(ref.statblockPath !== undefined && { statblockPath: ref.statblockPath }),
  };
}

/**
 * The encounter being built: its creatures, its name and saving it. Editing a saved encounter starts
 * from its name and its creatures, taken once the collection's creatures are read, and saves in its
 * place, keeping the references it had (`encounterDrafts`).
 */
export function useEncounterDraft(
  app: App,
  assetService: AssetService | null,
  collectionId: string,
  editing: EncounterAsset | null,
  roster: { all: readonly TokenAsset[]; loading: boolean },
): EncounterDraft {
  const [picks, setPicks] = useState<EncounterPick[]>([]);
  const [name, setName] = useState(editing?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [defaultName] = useState(defaultEncounterName);
  const seeded = useRef(false);

  useEffect(() => {
    if (!editing || roster.loading || seeded.current) return;
    seeded.current = true;
    const known = new Map(roster.all.map((token) => [token.id, token]));
    setPicks(picksFromEncounter(editing.tokens, known, (ref) => tokenOfRef(app, ref)));
  }, [app, editing, roster.all, roster.loading]);

  const save = async (): Promise<boolean> => {
    if (!assetService || picks.length === 0) return false;
    const named = name.trim() || defaultName;
    setSaving(true);
    try {
      if (editing) return await updateEncounter(app, assetService, editing.id, encounterDrafts(picks, editing.tokens), named);
      return (await storeEncounter(app, assetService, collectionId, encounterDrafts(picks), named)) !== null;
    } finally {
      setSaving(false);
    }
  };

  return { picks, setPicks, name, setName, defaultName, saving, save };
}
