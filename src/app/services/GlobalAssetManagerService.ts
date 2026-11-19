import { App } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import AssetManager from '../packages/components/asset-manager/AssetManager';
import { AtlasUIContext } from '../react/root/AtlasUIContext';
import { ContextMenuProvider } from '../react/root/ContextMenuContext';
import type { Tab } from '../packages/components/asset-manager/types';
import { portalHost } from '../host/portalHost';
import type { ExternalImport } from './collectionBundle/externalImport';

export class GlobalAssetManagerService {
  private app: App;
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private initialTab: Tab | undefined;
  private pendingImport: ExternalImport | undefined;
  /** Raised by every request for the Armarium while open; 0 opens the library. */
  private armariumRequest = 0;

  constructor(app: App) {
    this.app = app;
  }

  open(tab?: 'scenes' | 'maps' | 'campaigns' | 'characters' | 'tokens' | 'party' | 'encounters'): void {
    if (this.isOpen) {
      // If already open, just update the tab
      this.close();
    }

    const mappedTab: Tab | undefined =
      tab === 'campaigns' ? 'encounters' :
      tab === 'characters' ? 'tokens' :
      tab;
    this.initialTab = mappedTab;
    this.isOpen = true;

    // Create container
    this.container = portalHost().createDiv();
    this.container.addClasses(['atlas-vtt-plugin', 'atlas-global-asset-manager-container']);

    this.root = createRoot(this.container);
    this.render(this.root, true);
  }

  /** Shows the Armarium in the open window, which stays mounted, or in one opened for it. */
  openArmarium(): void {
    if (!this.isOpen || !this.root) this.open();
    this.armariumRequest += 1;
    if (this.root) this.render(this.root, true);
  }

  /**
   * Shows the import review of an Armarium install over the Armarium: in the open window, or in one opened for it.
   * Only for a bundle no open asset manager took (`ArmariumHosts`). Nothing is imported unless the GM confirms.
   */
  importBundle(pending: ExternalImport): void {
    this.pendingImport = pending;
    this.openArmarium();
  }

  /** No ViewStoreProvider: there is no map view here, the asset manager reads the store optionally. */
  private render(root: Root, isOpen: boolean, onExitComplete?: () => void): void {
    const contextValue = {
      app: this.app,
      view: null,
      pixiApp: null,
      renderer: null,
      isPlayerMode: false,
      setPlayerMode: () => {}
    };
    root.render(
      React.createElement(AtlasUIContext.Provider, {
        value: contextValue,
        children: React.createElement(ContextMenuProvider, {
          children: React.createElement(AssetManager, {
            isOpen,
            onClose: () => this.close(),
            ...(onExitComplete ? { onExitComplete } : {}),
            ...(this.initialTab ? { initialTab: this.initialTab } : {}),
            ...(this.pendingImport ? { pendingImport: this.pendingImport } : {}),
            ...(this.armariumRequest > 0 ? { armariumRequest: this.armariumRequest } : {})
          })
        })
      })
    );
  }

  /** Plays the closing animation, then unmounts. */
  close(): void {
    const root = this.root;
    const container = this.container;
    this.root = null;
    this.container = null;
    this.isOpen = false;
    this.initialTab = undefined;
    this.pendingImport = undefined;
    this.armariumRequest = 0;
    if (!root) {
      container?.remove();
      return;
    }
    this.render(root, false, () => {
      root.unmount();
      container?.remove();
    });
  }

  isModalOpen(): boolean {
    return this.isOpen;
  }
}
