// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { updateBlock } from '../../../../src/app/statblocks/model/treeOps';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import {
  closeSessionVault, described, heading, insertDivider, openSession, sessionVault, type SessionVault,
} from './sessionVault';
import { MARSH_ID, MARSH_PATH, marshText } from './templateTexts';

let vault: SessionVault;
const opened: TemplateSession[] = [];
const open = (id = MARSH_ID): Promise<TemplateSession> => openSession(vault, opened, id);
const processCalls = (): number => vi.mocked(vault.app.vault.process).mock.calls.length;
const createCalls = (): number => vi.mocked(vault.app.vault.create).mock.calls.length;
/** Long enough for any write a session might have scheduled on its own. */
const A_WHILE_MS = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vault = sessionVault();
});

afterEach(async () => {
  for (const session of opened.splice(0)) session.release();
  await closeSessionVault(vault);
  vi.useRealTimers();
});

describe('TemplateSession: history', () => {
  it('records exactly one step for one tree edit, and undo takes it back', async () => {
    const session = await open();
    const before = session.getSnapshot().template;
    session.apply(insertDivider);
    expect(session.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false, saveState: 'dirty', dirty: true });
    session.undo();
    expect(session.getSnapshot()).toMatchObject({ template: before, canUndo: false, canRedo: true, dirty: false });
    session.redo();
    expect(session.getSnapshot().template.layout.blocks[0]?.type).toBe('divider');
  });

  it('records nothing for an edit that changes nothing, even one that copies the template', async () => {
    const session = await open();
    const before = session.getSnapshot();
    session.apply((template) => ({ ...template }));
    session.apply((template) => ({ ...template, layout: updateBlock(template.layout, 'nowhere', 'stat', { label: 'X' }).layout }));
    expect(session.getSnapshot()).toBe(before);
  });

  it('makes one step of a gesture', async () => {
    const session = await open();
    const before = session.getSnapshot().template;
    session.beginGesture();
    for (const text of ['A', 'At', 'Att', 'Attacks']) session.apply(heading(text));
    session.endGesture();
    session.undo();
    expect(session.getSnapshot()).toMatchObject({ template: before, canUndo: false });
  });

  it('puts back what an abandoned gesture changed and leaves no step', async () => {
    const session = await open();
    session.apply(described('First'));
    const before = session.getSnapshot().template;
    session.beginGesture();
    session.apply(heading('Moves'));
    session.apply(insertDivider);
    session.abandonGesture();
    expect(session.getSnapshot().template).toBe(before);
    session.undo();
    expect(session.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('ignores undo and redo during a gesture', async () => {
    const session = await open();
    session.apply(described('First'));
    session.beginGesture();
    session.apply(described('Second'));
    session.undo();
    expect(session.getSnapshot().template.description).toBe('Second');
    session.endGesture();
  });
});

describe('TemplateSession: saving', () => {
  it('writes nothing until it is saved, then writes the draft once and keeps its history', async () => {
    const session = await open();
    session.apply(described('One'));
    session.apply(described('Two'));
    await vi.advanceTimersByTimeAsync(A_WHILE_MS);
    expect(processCalls()).toBe(0);
    expect(vault.files.get(MARSH_PATH)).toBe(marshText());

    expect(await session.save()).toEqual({ ok: true });
    expect(processCalls()).toBe(1);
    expect(vault.files.get(MARSH_PATH)).toBe(serializeTemplate(session.getSnapshot().template));
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', dirty: false, canUndo: true });
    // Undoing past the save is a change again, written only by the next save.
    session.undo();
    expect(session.getSnapshot().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(A_WHILE_MS);
    expect(processCalls()).toBe(1);
  });

  it('ignores its own write coming back from the vault; the library has the template as saved, never a draft', async () => {
    const session = await open();
    const library = TemplateLibrary.forApp(vault.app);
    session.apply(described('Mine'));
    expect(library.get(MARSH_ID)?.template.description).toBe(MARSH_CREATURE.description);
    await session.save();
    await vault.settled();
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', canUndo: true, conflict: null });
    expect(library.get(MARSH_ID)?.template.description).toBe('Mine');
  });

  it('says why a write failed, keeps the draft, and writes it on the next save', async () => {
    const session = await open();
    vi.mocked(vault.app.vault.process).mockRejectedValueOnce(new Error('Disk full.'));
    session.apply(described('Mine'));
    expect(await session.save()).toEqual({ ok: false, problem: 'Couldn\'t save: Disk full.' });
    expect(session.getSnapshot()).toMatchObject({ saveState: 'error', saveProblem: 'Couldn\'t save: Disk full.', dirty: true });
    await vi.advanceTimersByTimeAsync(A_WHILE_MS);
    expect(processCalls()).toBe(1);
    expect(await session.save()).toEqual({ ok: true });
    expect(session.getSnapshot()).toMatchObject({ saveState: 'saved', saveProblem: null });
    expect(JSON.parse(vault.files.get(MARSH_PATH)!)).toMatchObject({ description: 'Mine' });
  });

  it('drops the draft and its history on discard, and when the last holder lets go', async () => {
    const session = await open();
    session.apply(described('Dropped'));
    session.discard();
    expect(session.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });
    expect(session.getSnapshot().template.description).toBe(MARSH_CREATURE.description);

    session.apply(described('Left behind'));
    opened.splice(0);
    session.release();
    await vi.advanceTimersByTimeAsync(A_WHILE_MS);
    expect(processCalls()).toBe(0);
    const again = await open();
    expect(again.getSnapshot()).toMatchObject({ dirty: false });
    expect(again.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
  });
});

describe('TemplateSession: sharing, built-ins and templates never saved', () => {
  it('gives two views of one template one draft, history and save state', async () => {
    const first = await open();
    const second = await open();
    expect(first.alone).toBe(false);
    first.apply(described('Shared'));
    expect(second.getSnapshot()).toBe(first.getSnapshot());
    second.undo();
    expect(first.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    first.release();
    expect(second.alone).toBe(true);
    second.apply(described('Still open'));
    expect(second.getSnapshot().template.description).toBe('Still open');
  });

  it('ends a gesture a view still holds when it lets go, so the other views undo again', async () => {
    const first = await open();
    const second = await open();
    first.beginGesture();
    first.apply(described('Held'));
    first.release();
    // The view's React tree unmounts after the release; its cleanup reaches a released handle.
    first.endGesture();
    second.apply(described('After'));
    second.undo();
    expect(second.getSnapshot().template.description).toBe('Held');
    second.undo();
    expect(second.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
  });

  it('ends only the gestures a view began itself', async () => {
    const first = await open();
    const second = await open();
    first.beginGesture();
    first.apply(described('Typing'));
    second.endGesture();
    second.abandonGesture();
    first.apply(heading('Moves'));
    first.endGesture();
    expect(first.getSnapshot().template.description).toBe('Typing');
    first.undo();
    expect(first.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
  });

  it('edits a built-in like any template but never writes it; a template of a newer Atlas stays read-only', async () => {
    const builtIn = await open('builtin:generic-creature');
    expect(builtIn.getSnapshot()).toMatchObject({ readOnly: false, builtIn: true, path: null, dirty: false });
    builtIn.apply(described('Changed'));
    expect(builtIn.getSnapshot()).toMatchObject({ dirty: true, canUndo: true });
    expect(await builtIn.save()).toEqual({ ok: false, problem: 'Save it as a new template.' });
    expect(processCalls() + createCalls()).toBe(0);

    vault.writeExternally(MARSH_PATH, marshText({ version: 2 }));
    await vault.settled();
    const newer = await open();
    expect(newer.getSnapshot()).toMatchObject({ readOnly: true, readOnlyReason: 'newer' });
    newer.apply(described('Changed'));
    expect(newer.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    expect(TemplateSession.open(vault.app, 'unknown-abc123')).toBeNull();
  });

  it('holds a template never saved under an id of its own while a view holds it, and writes no file', async () => {
    await vault.settled();
    const session = TemplateSession.openUnsaved(vault.app, MARSH_CREATURE, 'New template', { collectionId: 'campaign', roleId: 'npc' });
    const { id } = session.getSnapshot();
    expect(id).not.toBe(MARSH_ID);
    expect(session.getSnapshot()).toMatchObject({ name: 'New template', unsaved: true, builtIn: false, path: null, dirty: true });
    expect(session.roleOnSave).toEqual({ collectionId: 'campaign', roleId: 'npc' });
    expect(await session.save()).toEqual({ ok: false, problem: 'Save it as a new template.' });

    const view = TemplateSession.open(vault.app, id);
    expect(view?.getSnapshot()).toBe(session.getSnapshot());
    session.release();
    view?.release();
    expect(TemplateSession.open(vault.app, id)).toBeNull();
    expect(processCalls() + createCalls()).toBe(0);
  });
});
