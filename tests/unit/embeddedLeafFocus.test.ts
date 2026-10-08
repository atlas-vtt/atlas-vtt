import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import { restorePreservedLeaf, suppressActiveLeaf } from '../../src/app/utils/embeddedLeafFocus';

describe('restorePreservedLeaf', () => {
  it('restores the preserved leaf while it is still the selected workspace leaf', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active" id="statblock-leaf">
        <div id="statblock-view"></div>
      </div>
      <div class="workspace-leaf" id="map-leaf">
        <div id="map-view"></div>
      </div>
    `;

    const preservedLeaf = {
      view: {
        containerEl: document.getElementById('statblock-view'),
      },
    };
    const workspace = {
      setActiveLeaf: vi.fn(),
    };

    restorePreservedLeaf(workspace, preservedLeaf as any);

    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(preservedLeaf, { focus: false });
  });

  it('does not reassert a stale preserved leaf after the user switched to another tab', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf" id="statblock-leaf">
        <div id="statblock-view"></div>
      </div>
      <div class="workspace-leaf mod-active" id="map-leaf">
        <div id="map-view"></div>
      </div>
    `;

    const preservedLeaf = {
      view: {
        containerEl: document.getElementById('statblock-view'),
      },
    };
    const workspace = {
      setActiveLeaf: vi.fn(),
    };

    restorePreservedLeaf(workspace, preservedLeaf as any);

    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
  });
});

describe('suppressActiveLeaf', () => {
  function createWorkspace(): { workspace: { setActiveLeaf: (leaf: WorkspaceLeaf) => void }; activated: WorkspaceLeaf[] } {
    const activated: WorkspaceLeaf[] = [];
    return { workspace: { setActiveLeaf: (leaf) => { activated.push(leaf); } }, activated };
  }

  it('ignores activations until it is released', () => {
    const { workspace, activated } = createWorkspace();
    const leaf = new WorkspaceLeaf();

    const release = suppressActiveLeaf(workspace);
    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([]);

    release();
    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([leaf]);
  });

  it('activates leaves again once two overlapping suppressions were released in the order they began', () => {
    const { workspace, activated } = createWorkspace();
    const leaf = new WorkspaceLeaf();

    const releaseFirst = suppressActiveLeaf(workspace);
    const releaseSecond = suppressActiveLeaf(workspace);
    releaseFirst();
    releaseSecond();

    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([leaf]);
  });

  it('ignores activations until the last of two overlapping suppressions is released', () => {
    const { workspace, activated } = createWorkspace();

    const releaseFirst = suppressActiveLeaf(workspace);
    const releaseSecond = suppressActiveLeaf(workspace);
    releaseFirst();
    workspace.setActiveLeaf(new WorkspaceLeaf());
    expect(activated).toEqual([]);

    releaseSecond();
  });

  it('keeps another suppression in place when one is released twice', () => {
    const { workspace, activated } = createWorkspace();
    const leaf = new WorkspaceLeaf();

    const releaseFirst = suppressActiveLeaf(workspace);
    const releaseSecond = suppressActiveLeaf(workspace);
    releaseFirst();
    releaseFirst();
    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([]);

    releaseSecond();
    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([leaf]);
  });
});
