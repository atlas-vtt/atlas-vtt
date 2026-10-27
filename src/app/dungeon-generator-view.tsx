import { ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { openCreatedScene } from './import/openCreatedScene';
import { t } from './i18n';
import { DungeonGeneratorPage } from './packages/components/dungeon-generator/DungeonGeneratorPage';
import type { CreatedDungeonScene } from './packages/components/dungeon-generator/useGeneratorActions';
import { getLoadedAtlasView } from './plugin/atlasLeaves';
import { AssetService } from './services/AssetService';

export const DUNGEON_GENERATOR_VIEW_TYPE = 'atlas-dungeon-generator';

/** What the tab keeps across restarts: the collection the scene goes to. */
interface DungeonGeneratorViewState extends Record<string, unknown> {
  collection?: string;
}

/**
 * The dungeon generator in a tab of its own, needing no scene or Atlas view: the asset manager's
 * Generate Dungeon and the Generate dungeon command open it. The scene it creates opens in the
 * Atlas view, or in this tab's place where none is open.
 */
export class DungeonGeneratorView extends ItemView {
  private root: Root | null = null;
  private collection: string | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return DUNGEON_GENERATOR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('dungeon.title');
  }

  getIcon(): string {
    return 'castle';
  }

  getState(): DungeonGeneratorViewState {
    return this.collection ? { collection: this.collection } : {};
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const collection = (state as DungeonGeneratorViewState | null)?.collection;
    if (typeof collection === 'string') this.setCollection(collection);
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('atlas-vtt-plugin', 'atlas-dungeon-generator-view');
    this.root = createRoot(this.contentEl);
    if (!this.collection) {
      const assets = AssetService.getInstance(this.app);
      await assets.initialize();
      // A collection set while the index loaded wins.
      this.collection ??= assets.getDefaultCollectionId();
    }
    this.render();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  private setCollection(collection: string): void {
    if (collection === this.collection) return;
    this.collection = collection;
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  private render(): void {
    if (!this.root || !this.collection) return;
    this.root.render(
      <DungeonGeneratorPage
        app={this.app}
        collectionId={this.collection}
        onCollectionChange={(id) => this.setCollection(id)}
        onCreated={(scene) => { void this.openScene(scene); }}
        onClose={() => this.leaf.detach()}
      />,
    );
  }

  /** In the Atlas view as a scene tab of its own where one is open, else in this tab's place; a tab closed meanwhile opens it where Obsidian would. */
  private async openScene({ scenePath, name, entryLevel }: CreatedDungeonScene): Promise<void> {
    const atlas = getLoadedAtlasView(this.app);
    const here = this.root ? this.leaf : undefined;
    const opened = await openCreatedScene(this.app, scenePath, name, { leaf: atlas?.leaf ?? here, level: entryLevel });
    if (opened && atlas && this.root) this.leaf.detach();
  }
}
