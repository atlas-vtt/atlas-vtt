import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerReturnToAtlasOnClose } from '../../src/app/plugin/returnToAtlasOnClose';


interface FakeLeaf {
  viewType: string;
}

function createWorkspace(): {
  workspace: any;
  leaves: FakeLeaf[];
  activate: (leaf: FakeLeaf) => void;
} {
  const leaves: FakeLeaf[] = [];
  let onActiveLeafChange: (leaf: FakeLeaf | null) => void = () => {};

  const activate = (leaf: FakeLeaf): void => onActiveLeafChange(leaf);
  const workspace = {
    on: (_name: string, callback: (leaf: FakeLeaf | null) => void) => {
      onActiveLeafChange = callback;
      return {};
    },
    iterateAllLeaves: (callback: (leaf: FakeLeaf) => void) => leaves.forEach(callback),
    getLeavesOfType: (type: string) => leaves.filter((leaf) => leaf.viewType === type),
    setActiveLeaf: vi.fn((leaf: FakeLeaf) => activate(leaf)),
  };
  return { workspace, leaves, activate };
}

describe('registerReturnToAtlasOnClose', () => {
  let setup: ReturnType<typeof createWorkspace>;
  const atlas: FakeLeaf = { viewType: 'atlas-vtt' };
  const neighbour: FakeLeaf = { viewType: 'markdown' };
  const note: FakeLeaf = { viewType: 'markdown' };

  beforeEach(() => {
    setup = createWorkspace();
    setup.leaves.push(atlas, note, neighbour);
    registerReturnToAtlasOnClose({ app: { workspace: setup.workspace }, registerEvent: () => {} } as any);
  });

  const close = (leaf: FakeLeaf): void => {
    setup.leaves.splice(setup.leaves.indexOf(leaf), 1);
  };

  it('returns to the Atlas view when a tab entered from it closes', () => {
    setup.activate(atlas);
    setup.activate(note);
    close(note);
    setup.activate(neighbour);

    expect(setup.workspace.setActiveLeaf).toHaveBeenCalledWith(atlas, { focus: true });
  });

  it('leaves the neighbour active when the closed tab was not entered from Atlas', () => {
    setup.activate(neighbour);
    setup.activate(note);
    close(note);
    setup.activate(neighbour);

    expect(setup.workspace.setActiveLeaf).not.toHaveBeenCalled();
  });

  it('does nothing when the tab entered from Atlas is still open', () => {
    setup.activate(atlas);
    setup.activate(note);
    setup.activate(neighbour);

    expect(setup.workspace.setActiveLeaf).not.toHaveBeenCalled();
  });

  it('does not refocus Atlas when Obsidian already returned to it', () => {
    setup.activate(atlas);
    setup.activate(note);
    close(note);
    setup.activate(atlas);

    expect(setup.workspace.setActiveLeaf).not.toHaveBeenCalled();
  });

  it('does nothing when the Atlas view closed in the meantime', () => {
    setup.activate(atlas);
    setup.activate(note);
    close(atlas);
    close(note);
    setup.activate(neighbour);

    expect(setup.workspace.setActiveLeaf).not.toHaveBeenCalled();
  });
});
