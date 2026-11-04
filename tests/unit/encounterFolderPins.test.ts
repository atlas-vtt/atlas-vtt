// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { isEncounterFolderLink } from '../../src/app/links/atlasLinkTargets';
import { encounterFoldersOf, encounterFolderTrail, linkedEncounterFolder } from '../../src/app/encounters/encounterFolders';
import { pickEncounter, rollEncounterFolder } from '../../src/app/encounters/encounterFolderRoll';
import { movedFolderPathOf } from '../../src/app/services/renamedPaths';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { linksReadableNote } from '../../src/app/tools/pinNoteLink';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/encounters/encounterFolderRoll', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/encounters/encounterFolderRoll')>()),
  rollEncounterFolder: vi.fn(async () => undefined),
}));

const CAIRN = 'atlas-vtt/collections/cairn';
const ENCOUNTERS = `${CAIRN}/encounters`;

describe('links to folders of encounters', () => {
  it('names a collection\'s encounters folder and the folders below it, never a file or a heading', () => {
    expect(isEncounterFolderLink(ENCOUNTERS)).toBe(true);
    expect(isEncounterFolderLink(`${ENCOUNTERS}/Wilds/Forest`)).toBe(true);
    expect(isEncounterFolderLink(`${ENCOUNTERS}/ambush.json`)).toBe(false);
    expect(isEncounterFolderLink(`${CAIRN}/scenes/Cave.atlasmap`)).toBe(false);
    expect(isEncounterFolderLink('Notes/encounters/Forest')).toBe(false);
    expect(isEncounterFolderLink(`${ENCOUNTERS}/Forest#Night`)).toBe(false);
    expect(linksReadableNote({ notePath: `${ENCOUNTERS}/Forest` })).toBe(false);
  });

  it('lists the scene\'s own folders that hold encounters, with the folders above them', () => {
    const { app } = createInMemoryApp({
      files: {
        [`${ENCOUNTERS}/ambush.json`]: '{}',
        [`${ENCOUNTERS}/Wilds/Forest/wolves.json`]: '{}',
        [`${ENCOUNTERS}/Wilds/Forest/bandits.json`]: '{}',
        [`${ENCOUNTERS}/Empty/notes.md`]: '',
        'atlas-vtt/collections/other/encounters/ogre.json': '{}',
      },
    });
    expect(encounterFoldersOf(app, `${CAIRN}/scenes/Cave.atlasmap`)).toEqual([
      { path: ENCOUNTERS, name: 'All encounters', trail: '', count: 3 },
      { path: `${ENCOUNTERS}/Wilds`, name: 'Wilds', trail: '', count: 2 },
      { path: `${ENCOUNTERS}/Wilds/Forest`, name: 'Forest', trail: 'Wilds', count: 2 },
    ]);
    expect(encounterFoldersOf(app, 'Maps/Loose.atlasmap')).toEqual([]);
    expect(encounterFolderTrail(`${ENCOUNTERS}/Wilds/Forest/Night`)).toBe('Wilds › Forest');
  });

  it('rolls from the same place in the scene\'s own collection where a pin came from another', () => {
    const scene = 'atlas-vtt/collections/copy/scenes/Cave.atlasmap';
    expect(linkedEncounterFolder(scene, `${ENCOUNTERS}/Forest`)).toBe('atlas-vtt/collections/copy/encounters/Forest');
    expect(linkedEncounterFolder('Maps/Loose.atlasmap', `${ENCOUNTERS}/Forest`)).toBeNull();
  });

  it('picks every encounter as likely, and none from an empty folder', () => {
    expect(pickEncounter(['a', 'b', 'c'], () => 0)).toBe('a');
    expect(pickEncounter(['a', 'b', 'c'], () => 0.5)).toBe('b');
    expect(pickEncounter(['a', 'b', 'c'], () => 0.9999)).toBe('c');
    expect(pickEncounter([], () => 0)).toBeNull();
  });

  it('follows a renamed folder, and only that folder', () => {
    const moved = movedFolderPathOf([{ from: `${ENCOUNTERS}/Forest`, to: `${ENCOUNTERS}/Woods` }]);
    expect(moved(`${ENCOUNTERS}/Forest`)).toBe(`${ENCOUNTERS}/Woods`);
    expect(moved(`${ENCOUNTERS}/Forest/Night`)).toBe(`${ENCOUNTERS}/Woods/Night`);
    expect(moved(`${ENCOUNTERS}/Forest2`)).toBeNull();

    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'folder-rename');
    store.getState().setPersistenceEnabled(false);
    const pin = store.getState().addNotePin(0, 0, `${ENCOUNTERS}/Forest/Night`);
    store.getState().retargetRenamedFolder(`${ENCOUNTERS}/Forest`, `${ENCOUNTERS}/Woods`);
    expect(store.getState().objects.pins[pin]?.notePath).toBe(`${ENCOUNTERS}/Woods/Night`);
  });
});

describe('clicking a pin that rolls encounters', () => {
  let destroy: (() => void) | null = null;
  afterEach(() => {
    destroy?.();
    destroy = null;
    vi.mocked(rollEncounterFolder).mockClear();
  });

  it('rolls in the view whose map holds the pin, and no other', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'folder-roll');
    const other = createViewAtlasStore(app, 'folder-roll-other');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(`${CAIRN}/scenes/Cave.atlasmap`);
    const tool = new NotePinTool(new EventEmitter(), app, store);
    destroy = () => tool.destroy();
    const pinId = store.getState().addNotePin(0, 0, `${ENCOUNTERS}/Forest`);
    const pin = store.getState().objects.pins[pinId];

    window.dispatchEvent(new CustomEvent('atlas-pin-action', { detail: { action: 'open', pin, store: other } }));
    expect(rollEncounterFolder).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent('atlas-pin-action', { detail: { action: 'open', pin, store } }));
    expect(rollEncounterFolder).toHaveBeenCalledWith(app, null, `${ENCOUNTERS}/Forest`);
  });
});
