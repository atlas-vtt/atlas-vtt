/**
 * The remote map view: an Atlas map view whose scene another plugin feeds through the extension
 * API (`remoteViews.open`), drawn by Atlas's own renderer from an inert store, the way
 * `PlayerView` is a map view with a player store. It never opens a file and is never saved. Its
 * owner is bound to the leaf before the view is made; a tab Obsidian restores at startup, or a
 * copy (a split, a duplicate), has no owner and closes itself once the layout is ready.
 */
import type { WorkspaceLeaf } from 'obsidian';
import type AtlasVTTPlugin from '../../../main';
import { AtlasView } from '../atlas-view';
import { takeRemoteOwner, type RemoteViewOwner } from './remoteOwners';
import { REMOTE_VIEW_TYPE } from './remoteViewType';
import { t } from '../i18n';

export class RemoteMapView extends AtlasView {
  /** Null for a tab nothing opened: it closes once the layout is ready. */
  readonly owner: RemoteViewOwner | null;

  constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin) {
    super(leaf, plugin, true, true);
    this.owner = takeRemoteOwner(leaf);
    // Opening a file, a dropped file or back/forward history would replace this tab.
    this.navigation = false;
  }

  getViewType(): string {
    return REMOTE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.owner?.title ?? t('remote.defaultTitle');
  }

  getIcon(): string {
    return this.owner?.icon ?? 'map';
  }

  /** A remote view never survives a restart, so the workspace keeps nothing of it. */
  getState(): { mapFilePath: null } {
    return { mapFilePath: null };
  }

  async setState(): Promise<void> {
    // Nothing to restore: the owner feeds the scene.
  }

  /** A linked pane's file-open would load a map into this view; it never opens a file. */
  async onLoadFile(): Promise<void> {
    // Nothing to load: the scene is fed from outside.
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    if (this.isClosed) return;
    this.containerEl.addClass('atlas-remote-view');
    const owner = this.owner;
    if (owner) {
      owner.opened(this);
      return;
    }
    this.app.workspace.onLayoutReady(() => {
      if (!this.isClosed) this.leaf.detach();
    });
  }

  async onClose(): Promise<void> {
    this.owner?.closed();
    await super.onClose();
  }

  protected onContainerResized(): void {
    this.owner?.resized();
  }
}
