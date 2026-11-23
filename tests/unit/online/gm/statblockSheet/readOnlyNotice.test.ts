import { describe, expect, it, vi } from 'vitest';
import type { PlayedCharacter } from '../../../../../src/app/online/gm/book/characters.ts';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { readOnlySheetText, StatblockShare, type ReadOnlyReason } from '../../../../../src/app/online/gm/book/statblockShare.ts';
import { readTemplateFile } from '../../../../../src/app/statblocks/library/templateFiles';
import type { ResolvedStatblock, TemplateLookup } from '../../../../../src/app/statblocks/model/resolvedTypes';
import { resolveNative } from '../../../../../src/app/statblocks/resolve/resolveStatblock';
import { resolvedOf } from './sheetKit';
import { templateOf } from '../../../statblocks/render/sheetTestKit';

vi.mock('obsidian', () => ({ TFile: class {}, normalizePath: (path: string) => path, Platform: { isDesktopApp: true, isMobile: false, isPhone: false, isMacOS: false } }));

const TEMPLATE = templateOf([{ key: 'name', label: 'Name', type: 'text' }, { key: 'speed', label: 'Speed', type: 'text' }], [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }]);
const NOTE = { name: 'Ana', speed: '30 ft.' };
const PATH = 'Characters/Ana.md';

/**
 * A template file as an author who bumped its "version" by hand publishes it: the file format's
 * version is 1, and a template saying 2 reads as one of a newer Atlas.
 */
const HAND_BUMPED = JSON.stringify({ format: 'atlas-statblock-template', ...TEMPLATE, version: 2 });

const character = (path: string | null = PATH): PlayedCharacter => ({ key: 'ana', statblockPath: path, drawnWith: { definitions: [], resources: undefined } }) as unknown as PlayedCharacter;

/** A table's statblocks over one note, and what the GM was told. */
function share(resolved: () => ResolvedStatblock | null): { share: StatblockShare; told: [string, ReadOnlyReason][]; poll: () => Promise<void> } {
  const told: [string, ReadOnlyReason][] = [];
  const statblocks = new StatblockShare({
    read: () => Promise.resolve(resolved()),
    write: () => Promise.resolve({ applied: [], conflicts: [], problem: null }),
    now: () => 0,
    changed: () => {},
    answered: () => {},
    owe: () => {},
    readOnly: (path, why) => told.push([path, why]),
  });
  /** Asks for the character's statblock as the books' poll does, until the note was read and drawn anew. */
  const poll = async (): Promise<void> => {
    for (let round = 0; round < 10; round += 1) {
      statblocks.of(character());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { share: statblocks, told, poll };
}

describe('a player\'s statblock whose template Atlas only reads', () => {
  it('is sent read-only where the template file says a version no Atlas has written', () => {
    const file = readTemplateFile('atlas-vtt/statblock-templates/Sheet.atlastemplate', HAND_BUMPED);
    expect(file.status).toBe('newer');
    const lookup: TemplateLookup = { get: (id) => (id === TEMPLATE.id ? file.entry : null) };
    const resolved = resolveNative(PATH, { kind: 'atlas', templateId: TEMPLATE.id }, NOTE, lookup);
    expect(resolved.templateStatus).toBe('newer');
    expect(statblockSheet({ resolved, definitions: [], resources: undefined })?.editable).toBe(false);
  });

  it('tells the GM once per note why, again when the reason changes, and not once the template reads', async () => {
    let status: 'ok' | 'missing' | 'newer' = 'newer';
    const { share: statblocks, told, poll } = share(() => resolvedOf(TEMPLATE, NOTE, status));
    await poll();
    await poll();
    expect(told).toEqual([[PATH, 'newer']]);

    status = 'missing';
    statblocks.changed(PATH);
    await poll();
    expect(told).toEqual([[PATH, 'newer'], [PATH, 'missing']]);

    status = 'ok';
    statblocks.changed(PATH);
    await poll();
    status = 'newer';
    statblocks.changed(PATH);
    await poll();
    expect(told).toEqual([[PATH, 'newer'], [PATH, 'missing'], [PATH, 'newer']]);
  });

  it('tells nothing for a statblock the player may change', async () => {
    const { told, poll } = share(() => resolvedOf(TEMPLATE, NOTE));
    await poll();
    expect(told).toEqual([]);
  });

  it('names the note without its folder and extension', () => {
    expect(readOnlySheetText('Party/Characters/Brannoch.md', 'newer')).toContain('Brannoch:');
    expect(readOnlySheetText('Brannoch.md', 'missing')).toContain('Brannoch:');
  });
});
