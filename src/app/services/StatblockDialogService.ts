import { App } from 'obsidian';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StatblockLinkModal from '../packages/components/asset-manager/StatblockLinkModal';
import type { NewStatblockOption } from '../statblocks/editor/create/roleChoices';
import { t } from '../i18n';

export class StatblockDialogService {
  private app: App;
  private modalContainer: HTMLElement | null = null;
  private root: Root | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Shows the statblock selection dialog
   * @param currentStatblockPath The currently linked statblock path (if any)
   * @param onLink Callback when a statblock is selected or unlinked
   * @param assetName The name of the asset/token being linked
   * @param art The token's artwork, which the previewed statblock shows as its portrait
   * @param newStatblock "New statblock…" for the token; absent while the statblock editor is off
   */
  public showStatblockDialog(
    currentStatblockPath: string | null,
    onLink: (statblockPath: string | null) => void,
    assetName: string = t('initiative.token'),
    art: { imagePath?: string | undefined; showRing?: boolean | undefined } = {},
    newStatblock?: NewStatblockOption,
  ): void {
    // Clean up any existing modal
    this.closeDialog();

    // Create container for the modal
    this.modalContainer = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

    const asset = {
      name: assetName,
      ...art,
      ...(currentStatblockPath ? { statblockPath: currentStatblockPath } : {}),
    };

    // Render the modal
    this.root = createRoot(this.modalContainer);
    this.root.render(
      React.createElement(StatblockLinkModal, {
        isOpen: true,
        onClose: () => this.closeDialog(),
        asset,
        onLink: (path: string | null) => {
          onLink(path);
          this.closeDialog();
        },
        app: this.app,
        newStatblock,
      })
    );
  }

  /**
   * Closes the statblock dialog if it's open
   */
  public closeDialog(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    if (this.modalContainer) {
      this.modalContainer.remove();
      this.modalContainer = null;
    }
  }
}