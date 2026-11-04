// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { createTokenStatblocks } from '../../../../src/app/packages/components/asset-manager/token-creator/tokenStatblocks';
import { AssetService } from '../../../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../../../src/app/services/TokenStatblockLinkService';
import { createStatblock, startStatblockCreation } from '../../../../src/app/statblocks/editor/create/createFlow';
import { promptStatblockName } from '../../../../src/app/statblocks/editor/create/CreationPrompt';
import { chooseTemplate } from '../../../../src/app/statblocks/editor/create/TemplateChoiceModal';
import { copyFenceIntoStatblock } from '../../../../src/app/statblocks/editor/statblock-pane/fenceCopy';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { noteOpenBody } from '../../../../src/app/statblocks/library/templateBodyNotes';
import { templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { frontmatterOfText } from '../../../../src/app/statblocks/notes/statblockSource';
import { libraryLoaded } from '../../../../src/app/statblocks/resolve/readStatblock';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

// The link service is tested on its own; its imports reach the canvas renderer.
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/create/CreationPrompt', () => ({ promptStatblockName: vi.fn() }));
vi.mock('../../../../src/app/statblocks/editor/create/TemplateChoiceModal', () => ({ chooseTemplate: vi.fn() }));

const BODY = '## Lair\n\nWhere it sleeps.\n';
const FENCE_NOTE = 'Bestiary/Fen hag.md';

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

/** A new note's body: what follows its frontmatter. */
function bodyOf(path: string): string {
  const text = harness.files.get(path);
  if (text === undefined) throw new Error(`no note ${path}`);
  return text.slice(text.indexOf('\n---\n') + 5);
}

beforeEach(() => {
  harness = noteHarness({
    [MARSH_PATH]: marshText(),
    [templateBodyPath(MARSH_PATH)]: BODY,
    [FENCE_NOTE]: 'She waits.\n\n```statblock\nname: Fen hag\nhp: 9\n```\n',
  });
  withStatblockEditor(app());
  vi.mocked(TokenStatblockLinkService.getInstance).mockReturnValue({ linkTokenToStatblock: vi.fn(async () => true) } as unknown as TokenStatblockLinkService);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'marsh',
    getCollectionSettings: () => ({ conditions: [], statblockRoles: [{ id: 'monster', name: 'Monster', templateId: MARSH_ID }] }),
    getCollections: async () => [{ id: 'marsh', name: 'Marsh' }],
  } as unknown as AssetService);
});

afterEach(() => {
  TemplateLibrary.release(app());
  NoteFieldWriter.release(app());
  vi.restoreAllMocks();
  vi.mocked(promptStatblockName).mockReset();
  vi.mocked(chooseTemplate).mockReset();
});

describe('a new statblock starts with the text of its template\'s note', () => {
  it('from a token on the map or in the asset manager', async () => {
    const path = await createStatblock(app(), { collectionId: 'marsh', roleId: 'monster', name: 'Warden', tokenImagePath: 'art/warden.webp', from: 'map' });
    expect(frontmatterOfText(harness.files.get(path!)!)).toMatchObject({ 'atlas-template': MARSH_ID, name: 'Warden' });
    expect(bodyOf(path!)).toBe(BODY);
  });

  it('from a command or the file menu', async () => {
    vi.mocked(chooseTemplate).mockImplementation(async (_app, offers) => offers.find((offer) => offer.templateId === MARSH_ID) ?? null);
    vi.mocked(promptStatblockName).mockResolvedValue('Bog Hag');
    const path = await startStatblockCreation(app(), { collectionId: 'marsh', from: 'command' });
    expect(bodyOf(path!)).toBe(BODY);
  });

  it('from the token creator', async () => {
    await createTokenStatblocks(app(), [{ name: 'Wolf', imagePath: 'art/wolf.webp' }], 'marsh', 'monster');
    expect(bodyOf('Wolf.md')).toBe(BODY);
  });

  it('from a Fantasy Statblocks fence copied into a new statblock, whose note keeps its own text', async () => {
    const path = await copyFenceIntoStatblock(app(), FENCE_NOTE, 'marsh', 'monster');
    expect(frontmatterOfText(harness.files.get(path!)!)).toMatchObject({ name: 'Fen hag', hp: 9 });
    expect(bodyOf(path!)).toBe(BODY);
  });

  it('as an open editor of the note holds it, before Obsidian has saved what was typed', async () => {
    await libraryLoaded(TemplateLibrary.forApp(app()));
    const note = app().vault.getFileByPath(templateBodyPath(MARSH_PATH))!;
    const stop = noteOpenBody(app(), note, { read: () => `${BODY}Typed a moment ago.\n`, replace: () => undefined });
    const path = await createStatblock(app(), { collectionId: 'marsh', roleId: 'monster', name: 'Heron', from: 'map' });
    stop();
    expect(bodyOf(path!)).toBe(`${BODY}Typed a moment ago.\n`);
    const later = await createStatblock(app(), { collectionId: 'marsh', roleId: 'monster', name: 'Egret', from: 'map' });
    expect(bodyOf(later!)).toBe(BODY);
  });

  it('empty where the template has no note', async () => {
    harness.files.delete(templateBodyPath(MARSH_PATH));
    const path = await createStatblock(app(), { collectionId: 'marsh', roleId: 'monster', name: 'Coot', from: 'map' });
    expect(bodyOf(path!)).toBe('');
  });
});
