// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { claimWorkspaceLeafFocus } from '../../src/app/utils/activeLeafGuard';

describe('claimWorkspaceLeafFocus', () => {
  it('reclaims the atlas leaf and focuses its container when another workspace leaf still owns focus', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active" id="atlas-leaf">
        <div id="atlas-container" tabindex="-1"></div>
      </div>
      <div class="workspace-leaf" id="template-leaf">
        <input id="template-input" />
      </div>
    `;

    const atlasLeaf = { id: 'atlas-leaf' };
    const workspace = {
      getActiveViewOfType: () => ({ leaf: { id: 'template-leaf' } }),
      setActiveLeaf: vi.fn(),
    };

    const atlasContainer = document.getElementById('atlas-container') as HTMLDivElement;
    const templateInput = document.getElementById('template-input') as HTMLInputElement;
    templateInput.focus();

    claimWorkspaceLeafFocus(workspace as any, atlasLeaf, atlasContainer);

    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(atlasLeaf, { focus: false });
    expect(document.activeElement).toBe(atlasContainer);
  });

  it('does not steal focus from a portal element outside workspace leaves', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active" id="atlas-leaf">
        <div id="atlas-container" tabindex="-1"></div>
      </div>
      <div id="portal">
        <input id="portal-input" />
      </div>
    `;

    const atlasLeaf = { id: 'atlas-leaf' };
    const workspace = {
      getActiveViewOfType: () => ({ leaf: atlasLeaf }),
      setActiveLeaf: vi.fn(),
    };

    const atlasContainer = document.getElementById('atlas-container') as HTMLDivElement;
    const portalInput = document.getElementById('portal-input') as HTMLInputElement;
    portalInput.focus();

    claimWorkspaceLeafFocus(workspace as any, atlasLeaf, atlasContainer);

    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(portalInput);
  });
});
