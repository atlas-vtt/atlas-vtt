// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { copyFenceIntoStatblock, fenceValues } from '../../../../src/app/statblocks/editor/statblock-pane/fenceCopy';
import { withPlainLinks } from '../../../../src/app/statblocks/fs/fenceStatblock';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));

const FENCE_NOTE = 'Bestiary/Fen hag.md';
const FENCE_TEXT = '---\ntags: marsh\n---\nShe waits.\n\n```statblock\nlayout: Marsh layout\nname: Fen hag\nhp: 9\nspeed: 30 ft.\nactions:\n  - name: Claw\n    desc: "[[Bleeding]] on a hit."\n```\n';

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

beforeEach(() => {
  harness = noteHarness({ [FENCE_NOTE]: FENCE_TEXT });
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'marsh',
    getCollectionSettings: () => ({
      conditions: [],
      statblockRoles: [{ id: 'monster', name: 'Monster', templateId: 'builtin:generic-creature' }],
      statblockRoleFolders: { monster: 'Bestiary/Atlas' },
    }),
  } as unknown as AssetService);
});

afterEach(() => {
  Reflect.deleteProperty(window, 'FantasyStatblocks');
  TemplateLibrary.release(app());
  NoteFieldWriter.release(app());
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
});

describe('Copy into a new statblock (§6.4)', () => {
  it('makes a native statblock of the role from the fence and opens it, leaving the fence\'s note as it was', async () => {
    withStatblockEditor(app());
    const path = await copyFenceIntoStatblock(app(), FENCE_NOTE, 'marsh', 'monster');

    expect(path).toBe('Bestiary/Atlas/Fen hag.md');
    expect(harness.files.get(FENCE_NOTE)).toBe(FENCE_TEXT);
    const text = harness.files.get(path!)!;
    expect(text).toMatch(/^---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Fen hag\nhp: 9\nspeed: 30 ft\.\nactions:\n/);
    expect(text).toContain('[[Bleeding]] on a hit.');
    expect(text).not.toContain('layout:');
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: path, collectionId: 'marsh', from: 'note', focusFirstEmpty: true });
  });

  it('starts from the template given, the template of the fence\'s layout', async () => {
    withStatblockEditor(app());
    const path = await copyFenceIntoStatblock(app(), FENCE_NOTE, 'marsh', 'monster', 'marsh-layout-abc123');
    expect(harness.files.get(path!)).toMatch(/^---\nstatblock: true\natlas-template: marsh-layout-abc123\nname: Fen hag\n/);
    expect(path).toBe('Bestiary/Atlas/Fen hag.md');
  });

  it('makes nothing while the switch is off', async () => {
    expect(await copyFenceIntoStatblock(app(), FENCE_NOTE, 'marsh', 'monster')).toBeNull();
    expect([...harness.files.keys()]).toEqual([FENCE_NOTE]);
  });
});

describe('fenceValues', () => {
  it('reads the creature as Fantasy Statblocks does while it is loaded: the bestiary\'s, the fence\'s own on top', async () => {
    harness.files.set(FENCE_NOTE, '```statblock\ncreature: Goblin\nhp: 12\n```\n');
    Object.assign(window, {
      FantasyStatblocks: {
        hasCreature: (name: string) => name === 'Goblin',
        getCreatureFromBestiary: () => ({ name: 'Goblin', hp: 7, ac: 15, senses: 'See <STATBLOCK-WIKI-LINK>Senses/Darkvision|darkvision<STATBLOCK-WIKI-LINK>' }),
      },
    });
    expect(await fenceValues(app(), FENCE_NOTE)).toEqual({
      name: 'Goblin',
      values: { hp: 12, ac: 15, senses: 'See [[Senses/Darkvision|darkvision]]' },
      layout: null,
    });
  });

  it('names the layout of the fence, else of the creature', async () => {
    expect((await fenceValues(app(), FENCE_NOTE))?.layout).toBe('Marsh layout');
    harness.files.set(FENCE_NOTE, '```statblock\ncreature: Goblin\n```\n');
    Object.assign(window, {
      FantasyStatblocks: { hasCreature: () => true, getCreatureFromBestiary: () => ({ name: 'Goblin', layout: 'Basic 5e Layout' }) },
    });
    expect((await fenceValues(app(), FENCE_NOTE))?.layout).toBe('Basic 5e Layout');
  });

  it('is null for a note without a fence', async () => {
    harness.files.set('Notes/Plain.md', 'Nothing here.\n');
    expect(await fenceValues(app(), 'Notes/Plain.md')).toBeNull();
  });
});

describe('withPlainLinks', () => {
  it('writes Fantasy Statblocks\' encoded links as the links they stand for, at any depth', () => {
    expect(withPlainLinks({
      lore: ['<STATBLOCK-MARKDOWN-LINK>Lore/Fen.md|the fen<STATBLOCK-MARKDOWN-LINK>'],
      note: '<STATBLOCK-WIKI-LINK>Hag<STATBLOCK-WIKI-LINK>',
      hp: 9,
    })).toEqual({ lore: ['[the fen](Lore/Fen.md)'], note: '[[Hag]]', hp: 9 });
  });
});
