import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { confirmAction } from '../../src/app/ui/confirmDialog';

/**
 * The asset manager as `GlobalAssetManagerService` and `AssetManager` mount it on the body, with
 * the dialog it has open beside its window, styled by the plugin's real stylesheet.
 */
const ASSET_MANAGER = (overlay: string): string => `
  <div class="atlas-vtt-plugin atlas-global-asset-manager-container">
    <div class="atlas-vtt-plugin atlas-vtt-root atlas-asset-manager-modal">
      <div class="atlas-asset-manager-window"></div>
    </div>
    ${overlay ? `<div class="atlas-vtt-plugin atlas-vtt-root ${overlay}"></div>` : ''}
  </div>
`;

/** The element drawn on top at the middle of the window. */
function onTop(): Element | null {
  return document.elementFromPoint(innerWidth / 2, innerHeight / 2);
}

describe('the layer of a confirmation', () => {
  const style = document.createElement('style');
  style.textContent = css;
  const host = document.createElement('div');

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
    document.body.append(host);
  });

  afterEach(() => {
    document.querySelectorAll('.atlas-text-dialog-backdrop').forEach((backdrop) => backdrop.remove());
    host.remove();
    style.remove();
  });

  it.each([
    ['the asset manager itself', '', 'atlas-asset-manager-window'],
    ['Manage', 'atlas-tag-manager-modal', 'atlas-tag-manager-modal'],
    ['the move dialog', 'atlas-asset-manager-move-modal', 'atlas-asset-manager-move-modal'],
    ['the collection settings', 'atlas-collection-settings-overlay', 'atlas-collection-settings-overlay'],
    ['the transfer dialog', 'atlas-transfer-overlay', 'atlas-transfer-overlay'],
  ])('opens in front of %s', (_name, overlay, covered) => {
    host.innerHTML = ASSET_MANAGER(overlay);
    expect(onTop()?.classList).toContain(covered);

    void confirmAction({ title: 'Delete', message: ['For good?'], confirmLabel: 'Delete', destructive: true });

    expect(onTop()?.closest('.atlas-text-dialog-backdrop')).not.toBeNull();
  });
});
