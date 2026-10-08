import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('puts back the very method a workspace had of its own', () => {
    const { workspace } = createWorkspace();
    const own = workspace.setActiveLeaf;

    suppressActiveLeaf(workspace)();

    expect(workspace.setActiveLeaf).toBe(own);
  });

  describe('on a workspace that inherits the method, as Obsidian\'s does', () => {
    class Workspace {
      activated: WorkspaceLeaf[] = [];
      setActiveLeaf(leaf: WorkspaceLeaf): void {
        this.activated.push(leaf);
      }
    }
    const inherited = Workspace.prototype.setActiveLeaf;
    afterEach(() => {
      Workspace.prototype.setActiveLeaf = inherited;
    });

    it('leaves nothing of its own on the workspace once released', () => {
      const workspace = new Workspace();
      const leaf = new WorkspaceLeaf();

      const release = suppressActiveLeaf(workspace);
      workspace.setActiveLeaf(leaf);
      expect(workspace.activated).toEqual([]);

      release();
      expect(Object.hasOwn(workspace, 'setActiveLeaf')).toBe(false);
      workspace.setActiveLeaf(leaf);
      expect(workspace.activated).toEqual([leaf]);
    });

    it('lets a later patch of the prototype take effect', () => {
      const workspace = new Workspace();
      suppressActiveLeaf(workspace)();

      const patched = vi.fn();
      Workspace.prototype.setActiveLeaf = patched;
      const leaf = new WorkspaceLeaf();
      workspace.setActiveLeaf(leaf);

      expect(patched).toHaveBeenCalledWith(leaf);
    });

    it('keeps what another plugin put on the workspace during the suppression, and activates through it', () => {
      const workspace = new Workspace();
      const leaf = new WorkspaceLeaf();

      const release = suppressActiveLeaf(workspace);
      // What a plugin's patch does: it keeps the method it found and calls it from its own.
      const found = workspace.setActiveLeaf;
      const patch = vi.fn((target: WorkspaceLeaf) => found.call(workspace, target));
      workspace.setActiveLeaf = patch;
      workspace.setActiveLeaf(leaf);
      expect(workspace.activated).toEqual([]);

      release();
      expect(workspace.setActiveLeaf).toBe(patch);
      workspace.setActiveLeaf(leaf);
      expect(workspace.activated).toEqual([leaf]);
    });
  });

  it('activates leaves again when two copies of the plugin suppressed at once', async () => {
    const { workspace, activated } = createWorkspace();
    const own = workspace.setActiveLeaf;
    const leaf = new WorkspaceLeaf();

    // A reload or an update leaves the old copy's suppression in place while the new one starts.
    const releaseOldCopy = suppressActiveLeaf(workspace);
    vi.resetModules();
    const newCopy = await import('../../src/app/utils/embeddedLeafFocus');
    expect(newCopy.suppressActiveLeaf).not.toBe(suppressActiveLeaf);
    const releaseNewCopy = newCopy.suppressActiveLeaf(workspace);

    releaseOldCopy();
    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([]);

    releaseNewCopy();
    expect(workspace.setActiveLeaf).toBe(own);
    workspace.setActiveLeaf(leaf);
    expect(activated).toEqual([leaf]);
  });
});
