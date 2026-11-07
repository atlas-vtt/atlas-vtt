// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import { NoteStatblockPanels } from '../../../../src/app/statblocks/editor/note-panel/noteStatblockPanels';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { FakeLeaf, fakeWorkspace, noteLeaf, type FakeWorkspace } from './workspaceKit';

const NOTE = 'Bestiary/Marsh Warden.md';

function setup(leaves: FakeLeaf[], current: FakeLeaf | null, switchedOn = true): { app: App; fake: FakeWorkspace; reveal: ReturnType<typeof vi.fn> } {
  const { app } = createInMemoryApp({ files: { [NOTE]: '---\nstatblock: true\n---\n' } });
  const fake = fakeWorkspace(leaves, current);
  app.workspace = fake.workspace;
  if (switchedOn) withStatblockEditor(app);
  const reveal = vi.fn();
  vi.spyOn(NoteStatblockPanels, 'forApp').mockReturnValue({ reveal } as unknown as NoteStatblockPanels);
  return { app, fake, reveal };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('openStatblockEditor', () => {
  it('opens the note in the current leaf, focuses it and asks its panel to show, with the entry point\'s request', async () => {
    const current = new FakeLeaf({ type: 'empty' });
    const { app, fake, reveal } = setup([current], current);
    await openStatblockEditor(app, { notePath: NOTE, collectionId: 'campaign', from: 'command', focusFirstEmpty: true });

    expect(current.openFile).toHaveBeenCalledWith(expect.objectContaining({ path: NOTE }), { active: true });
    expect(fake.workspace.createLeafBySplit).not.toHaveBeenCalled();
    expect(fake.workspace.setActiveLeaf).toHaveBeenCalledWith(current, { focus: true });
    expect(reveal).toHaveBeenCalledWith(current, { collectionId: 'campaign', focusFirstEmpty: true });
    expect(fake.leaves).toHaveLength(1);
  });

  it('never opens the note over a map: it splits to the map\'s right, so the canvas stays in view', async () => {
    const map = new FakeLeaf({ type: 'atlas-vtt', state: { file: 'Maps/Village.atlasmap' } });
    const { app, fake } = setup([map], map);
    await openStatblockEditor(app, { notePath: NOTE, from: 'map' });

    expect(map.openFile).not.toHaveBeenCalled();
    expect(fake.workspace.createLeafBySplit).toHaveBeenCalledWith(map, 'vertical');
    const [, note] = fake.leaves;
    expect(note!.getViewState().state?.file).toBe(NOTE);
  });

  it('splits beside the map from the map though another leaf is the current one', async () => {
    const map = new FakeLeaf({ type: 'atlas-vtt' });
    const graph = new FakeLeaf({ type: 'graph' });
    const { app, fake } = setup([map, graph], graph);
    await openStatblockEditor(app, { notePath: NOTE, from: 'map' });
    expect(fake.workspace.createLeafBySplit).toHaveBeenCalledWith(map, 'vertical');
  });

  it('focuses the leaf already showing the note instead of opening another', async () => {
    const showing = noteLeaf(NOTE);
    const other = new FakeLeaf({ type: 'markdown', state: { file: 'Other.md' } });
    const { app, fake, reveal } = setup([other, showing], other);
    await openStatblockEditor(app, { notePath: NOTE });

    expect(showing.openFile).not.toHaveBeenCalled();
    expect(other.openFile).not.toHaveBeenCalled();
    expect(fake.workspace.setActiveLeaf).toHaveBeenCalledWith(showing, { focus: true });
    expect(reveal).toHaveBeenCalledWith(showing, { collectionId: undefined, focusFirstEmpty: undefined });
  });

  it('opens a new tab where the current leaf shows neither a note nor nothing', async () => {
    const graph = new FakeLeaf({ type: 'graph' });
    const { app, fake } = setup([graph], graph);
    await openStatblockEditor(app, { notePath: NOTE, from: 'asset-manager' });
    expect(fake.workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(graph.openFile).not.toHaveBeenCalled();
  });

  it('opens nothing while the statblock editor is switched off, or for a note that is gone', async () => {
    const current = new FakeLeaf();
    const off = setup([current], current, false);
    await openStatblockEditor(off.app, { notePath: NOTE });
    expect(current.openFile).not.toHaveBeenCalled();

    const on = setup([current], current);
    await openStatblockEditor(on.app, { notePath: 'Bestiary/Gone.md' });
    expect(current.openFile).not.toHaveBeenCalled();
    expect(on.reveal).not.toHaveBeenCalled();
  });
});
