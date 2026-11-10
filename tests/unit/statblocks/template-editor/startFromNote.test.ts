// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { NoteTextModal } from '../../../../src/app/statblocks/editor/template-editor/shell/NoteTextModal';
import { startFromNote } from '../../../../src/app/statblocks/editor/template-editor/shell/startFromNote';
import { templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';

const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn(async () => true) }));
vi.mock('../../../../src/app/ui/confirmDialog', () => dialogs);
const notices = vi.hoisted(() => ({ showNotice: vi.fn() }));
vi.mock('../../../../src/app/ui/notice', () => notices);

const MARSH_NOTE = templateBodyPath(MARSH_PATH);
const GOBLIN = 'Bestiary/Goblin.md';
const GOBLIN_TEXT = '---\nstatblock: true\nname: Goblin\n---\n## Tactics\n\nThey run.\n';

let vault: SessionVault;
const opened: TemplateSession[] = [];
const open = <T extends TemplateSession | null>(session: T): NonNullable<T> => {
  opened.push(session!);
  return session!;
};

beforeEach(async () => {
  vault = sessionVault({ [MARSH_PATH]: marshText(), [GOBLIN]: GOBLIN_TEXT, 'Empty.md': '---\nname: Nobody\n---\n\n' });
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({ loadedCollections: () => [], updateCollectionSettings: vi.fn() } as unknown as AssetService);
  await vault.settled();
  dialogs.confirmAction.mockClear().mockResolvedValue(true);
  notices.showNotice.mockClear();
});

afterEach(async () => {
  for (const session of opened.splice(0)) session.release();
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

describe('starting a template\'s text from a note', () => {
  it('takes what the note holds below its properties, at once where the template has no text yet', async () => {
    const session = open(TemplateSession.openUnsaved(vault.app, MARSH_CREATURE, 'Bog Hag'));
    expect(await startFromNote(vault.app, session, GOBLIN)).toBe(true);
    expect(session.getSnapshot().draftBody).toBe('## Tactics\n\nThey run.\n');
    expect(dialogs.confirmAction).not.toHaveBeenCalled();
  });

  it('asks before it replaces text of the template\'s own, and keeps it when the answer is no', async () => {
    const session = open(TemplateSession.openUnsaved(vault.app, MARSH_CREATURE, 'Bog Hag', null, 'Mine.\n'));
    dialogs.confirmAction.mockResolvedValueOnce(false);
    expect(await startFromNote(vault.app, session, GOBLIN)).toBe(false);
    expect(session.getSnapshot().draftBody).toBe('Mine.\n');
    expect(dialogs.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Replace the text?', confirmLabel: 'Replace' }));
    expect(await startFromNote(vault.app, session, GOBLIN)).toBe(true);
    expect(session.getSnapshot().draftBody).toBe('## Tactics\n\nThey run.\n');
  });

  it('writes the note beside a saved template, made where it has none', async () => {
    const session = open(TemplateSession.open(vault.app, MARSH_ID));
    await startFromNote(vault.app, session, GOBLIN);
    expect(vault.files.get(MARSH_NOTE)).toBe('## Tactics\n\nThey run.\n');
    expect(dialogs.confirmAction).not.toHaveBeenCalled();
    vault.writeExternally(GOBLIN, 'Shorter.\n');
    await startFromNote(vault.app, session, GOBLIN);
    expect(dialogs.confirmAction).toHaveBeenCalledTimes(1);
    expect(vault.files.get(MARSH_NOTE)).toBe('Shorter.\n');
  });

  it('says so and changes nothing where the note has no text below its properties', async () => {
    const session = open(TemplateSession.openUnsaved(vault.app, MARSH_CREATURE, 'Bog Hag', null, 'Mine.\n'));
    expect(await startFromNote(vault.app, session, 'Empty.md')).toBe(false);
    expect(notices.showNotice).toHaveBeenCalledWith('Empty has no text to start from.');
    expect(session.getSnapshot().draftBody).toBe('Mine.\n');
  });

  it('searches every note of the vault but the template\'s own', () => {
    vault.writeExternally(MARSH_NOTE, 'Lair.\n');
    const paths = (skip: string | null): string[] => new NoteTextModal(vault.app, skip, () => undefined).getItems().map((file: TFile) => file.path).sort();
    expect(paths(MARSH_NOTE)).toEqual([GOBLIN, 'Empty.md'].sort());
    expect(paths(null)).toContain(MARSH_NOTE);
  });
});
