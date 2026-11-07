// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { saveTemplate } from '../../../../src/app/statblocks/editor/template-editor/save/saveTemplate';
import { copyTemplate, createTemplateFile, deleteTemplate } from '../../../../src/app/statblocks/library/templateActions';
import { followTemplateBodies, noteOpenBody, readTemplateBody, replaceTemplateBody, startTemplateBody } from '../../../../src/app/statblocks/library/templateBodyNotes';
import { freeTemplatePath, templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { closeSessionVault, described, sessionVault, type SessionVault } from './sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from './templateTexts';

const MARSH_NOTE = templateBodyPath(MARSH_PATH);
const LAIR = '## Lair\n\nA drowned mill.\n';

let vault: SessionVault;
let stopFollowing: () => void;
const opened: TemplateSession[] = [];

beforeEach(async () => {
  vault = sessionVault({ [MARSH_PATH]: marshText(), [MARSH_NOTE]: LAIR });
  stopFollowing = followTemplateBodies(vault.app);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({ loadedCollections: () => [], updateCollectionSettings: vi.fn() } as unknown as AssetService);
  await vault.settled();
});

afterEach(async () => {
  for (const session of opened.splice(0)) session.release();
  stopFollowing();
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

const file = (path: string): TFile => new TFile(path);

describe('the note beside a template', () => {
  it('is the template file\'s name with .md, in the same folder', () => {
    expect(MARSH_NOTE).toBe(`${TEMPLATE_FOLDER}/Marsh creature.md`);
    expect(templateBodyPath('Elsewhere/Bog.atlastemplate')).toBe('Elsewhere/Bog.md');
  });

  it('holds the text new statblocks start with; a template without a file or a note has none', async () => {
    expect(await readTemplateBody(vault.app, MARSH_PATH)).toBe(LAIR);
    expect(await readTemplateBody(vault.app, null)).toBe('');
    vault.deleteExternally(MARSH_NOTE);
    expect(await readTemplateBody(vault.app, MARSH_PATH)).toBe('');
  });

  it('is started empty for the user to write in, and an existing one is kept as it is', async () => {
    vault.deleteExternally(MARSH_NOTE);
    expect((await startTemplateBody(vault.app, MARSH_PATH)).path).toBe(MARSH_NOTE);
    expect(vault.files.get(MARSH_NOTE)).toBe('');
    vault.writeExternally(MARSH_NOTE, LAIR);
    await startTemplateBody(vault.app, MARSH_PATH);
    expect(vault.files.get(MARSH_NOTE)).toBe(LAIR);
  });
});

describe('the note follows its template file', () => {
  it('moves when the template is renamed or moved', async () => {
    await vault.app.fileManager.renameFile(file(MARSH_PATH), 'Bestiary/Bog creature.atlastemplate');
    await vi.waitFor(() => expect(vault.files.get('Bestiary/Bog creature.md')).toBe(LAIR));
    expect(vault.files.has(MARSH_NOTE)).toBe(false);
  });

  it('stays where a note of that name already is, and never writes over it', async () => {
    vault.writeExternally(`${TEMPLATE_FOLDER}/Bog.md`, 'Someone else\'s.\n');
    await vault.app.fileManager.renameFile(file(MARSH_PATH), `${TEMPLATE_FOLDER}/Bog.atlastemplate`);
    await vault.settled();
    expect(vault.files.get(`${TEMPLATE_FOLDER}/Bog.md`)).toBe('Someone else\'s.\n');
    expect(vault.files.get(MARSH_NOTE)).toBe(LAIR);
  });

  it('goes to the trash with a deleted template, and stays with a deleted note of the same name', async () => {
    vault.deleteExternally(MARSH_PATH);
    await vi.waitFor(() => expect(vault.files.has(MARSH_NOTE)).toBe(false));
    expect(vault.app.fileManager.trashFile).toHaveBeenCalledWith(expect.objectContaining({ path: MARSH_NOTE }));

    vault.writeExternally('Notes/Bog.md', 'Kept.\n');
    vault.writeExternally('Notes/Bog.atlastemplate', '{}');
    vault.deleteExternally('Notes/Bog.md');
    await vault.settled();
    expect(vault.files.has('Notes/Bog.atlastemplate')).toBe(true);
  });

  it('no longer once the plugin stopped following', async () => {
    stopFollowing();
    vault.deleteExternally(MARSH_PATH);
    await vault.settled();
    expect(vault.files.get(MARSH_NOTE)).toBe(LAIR);
  });
});

describe('templates made, copied and deleted with their note', () => {
  it('writes the text of a new template into its note, and no note for an empty one', async () => {
    const made = await createTemplateFile(vault.app, 'Heron', MARSH_CREATURE, 'Wades.\n');
    expect(vault.files.get(templateBodyPath(made.path))).toBe('Wades.\n');
    const bare = await createTemplateFile(vault.app, 'Egret', MARSH_CREATURE);
    expect(vault.files.has(templateBodyPath(bare.path))).toBe(false);
  });

  it('never gives a new template a name whose note stands there already', async () => {
    vault.writeExternally(`${TEMPLATE_FOLDER}/Heron.md`, 'A note about herons.\n');
    expect(freeTemplatePath(vault.app, TEMPLATE_FOLDER, 'Heron')).toBe(`${TEMPLATE_FOLDER}/Heron 2.atlastemplate`);
    const made = await createTemplateFile(vault.app, 'Heron', MARSH_CREATURE, 'Wades.\n');
    expect(made.path).toBe(`${TEMPLATE_FOLDER}/Heron 2.atlastemplate`);
    expect(vault.files.get(`${TEMPLATE_FOLDER}/Heron.md`)).toBe('A note about herons.\n');
  });

  it('copies the note with the template', async () => {
    const copy = await copyTemplate(vault.app, MARSH_ID);
    expect(vault.files.get(templateBodyPath(copy.path))).toBe(LAIR);
    expect(vault.files.get(MARSH_NOTE)).toBe(LAIR);
  });

  it('trashes the note with the template', async () => {
    await deleteTemplate(vault.app, MARSH_ID, null);
    expect(vault.files.has(MARSH_PATH)).toBe(false);
    expect(vault.files.has(MARSH_NOTE)).toBe(false);
  });
});

describe('saving from the template editor', () => {
  const open = (session: TemplateSession | null): TemplateSession => {
    if (!session) throw new Error('no session');
    opened.push(session);
    return session;
  };

  it('Update writes the card alone: the note saves itself as it is typed', async () => {
    const session = open(TemplateSession.open(vault.app, MARSH_ID));
    session.apply(described('Changed.'));
    vault.writeExternally(MARSH_NOTE, 'Typed since.\n');
    expect(await saveTemplate(vault.app, session, { kind: 'update', name: 'Marsh creature' }, null)).toEqual({ ok: true, made: null });
    expect(vault.files.get(MARSH_NOTE)).toBe('Typed since.\n');
  });

  it('Save as new copies the note to the new template\'s name and leaves the original\'s', async () => {
    const session = open(TemplateSession.open(vault.app, MARSH_ID));
    session.apply(described('Changed.'));
    const outcome = await saveTemplate(vault.app, session, { kind: 'new', name: 'Bog creature' }, null);
    expect(outcome).toMatchObject({ ok: true, made: { path: `${TEMPLATE_FOLDER}/Bog creature.atlastemplate` } });
    expect(vault.files.get(`${TEMPLATE_FOLDER}/Bog creature.md`)).toBe(LAIR);
    expect(vault.files.get(MARSH_NOTE)).toBe(LAIR);
  });

  it('writes the text a template never saved was made with into its note at its first save', async () => {
    const session = open(TemplateSession.openUnsaved(vault.app, MARSH_CREATURE, 'Bog Hag', null, 'Keep away.\n'));
    expect(session.getSnapshot()).toMatchObject({ unsaved: true, draftBody: 'Keep away.\n' });
    await saveTemplate(vault.app, session, { kind: 'new', name: 'Bog Hag' }, null);
    expect(vault.files.get(`${TEMPLATE_FOLDER}/Bog Hag.md`)).toBe('Keep away.\n');
  });

  it('writes the text typed for a template never saved, in place of the one it was made with', async () => {
    const session = open(TemplateSession.openUnsaved(vault.app, MARSH_CREATURE, 'Bog Hag', null, 'Keep away.\n'));
    session.setDraftBody('## Lair\n\nA sunken hut.\n');
    expect(session.getSnapshot().draftBody).toBe('## Lair\n\nA sunken hut.\n');
    await saveTemplate(vault.app, session, { kind: 'new', name: 'Bog Hag' }, null);
    expect(vault.files.get(`${TEMPLATE_FOLDER}/Bog Hag.md`)).toBe('## Lair\n\nA sunken hut.\n');
  });

  it('lets a built-in hold typed text: it counts as a change, Save as new writes it, and discarding drops it', async () => {
    const session = open(TemplateSession.open(vault.app, 'builtin:generic-creature'));
    expect(session.getSnapshot().dirty).toBe(false);
    session.setDraftBody('Notes.\n');
    expect(session.getSnapshot()).toMatchObject({ draftBody: 'Notes.\n', dirty: true, saveState: 'dirty' });
    session.discard();
    expect(session.getSnapshot()).toMatchObject({ draftBody: '', dirty: false });
    session.setDraftBody('Notes.\n');
    await saveTemplate(vault.app, session, { kind: 'new', name: 'My creature' }, null);
    expect(vault.files.get(`${TEMPLATE_FOLDER}/My creature.md`)).toBe('Notes.\n');
  });

  it('keeps no typed text for a saved template: its text is its note\'s', () => {
    const session = open(TemplateSession.open(vault.app, MARSH_ID));
    session.setDraftBody('Elsewhere.\n');
    expect(session.getSnapshot()).toMatchObject({ draftBody: '', dirty: false });
  });

  it('replaces the note\'s text through the editor that shows it, else in the file, made where missing', async () => {
    const replace = vi.fn();
    const stop = noteOpenBody(vault.app, vault.app.vault.getFileByPath(MARSH_NOTE)!, { read: () => LAIR, replace });
    await replaceTemplateBody(vault.app, MARSH_PATH, 'From a note.\n');
    expect(replace).toHaveBeenCalledWith('From a note.\n');
    expect(vault.files.get(MARSH_NOTE)).toBe(LAIR);
    stop();
    await replaceTemplateBody(vault.app, MARSH_PATH, 'From a note.\n');
    expect(vault.files.get(MARSH_NOTE)).toBe('From a note.\n');
    vault.deleteExternally(MARSH_NOTE);
    await replaceTemplateBody(vault.app, MARSH_PATH, 'Again.\n');
    expect(vault.files.get(MARSH_NOTE)).toBe('Again.\n');
  });

  it('gives a copy of a built-in no note: built-ins have none', async () => {
    const session = open(TemplateSession.open(vault.app, 'builtin:generic-creature'));
    await saveTemplate(vault.app, session, { kind: 'new', name: 'My creature' }, null);
    expect(vault.files.has(`${TEMPLATE_FOLDER}/My creature.atlastemplate`)).toBe(true);
    expect(vault.files.has(`${TEMPLATE_FOLDER}/My creature.md`)).toBe(false);
  });

  it('saves the draft as a copy with a copy of the note, where the file changed under it', async () => {
    const session = open(TemplateSession.open(vault.app, MARSH_ID));
    session.apply(described('Mine'));
    vault.writeExternally(MARSH_PATH, marshText({ description: 'Theirs' }));
    await vault.settled();
    await session.resolveConflict('save-copy');
    expect(vault.files.get(`${TEMPLATE_FOLDER}/Marsh creature copy.md`)).toBe(LAIR);
  });

  it('keeps the library\'s templates free of any note text', () => {
    expect(TemplateLibrary.forApp(vault.app).get(MARSH_ID)!.template).not.toHaveProperty('body');
  });
});
