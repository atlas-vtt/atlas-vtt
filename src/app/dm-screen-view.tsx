import { ItemView, type App } from 'obsidian';
import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AtlasView } from './atlas-view';
import { ATLAS_VIEW_TYPE } from './atlasViewType';
import { t } from './i18n';
import { getLoadedAtlasView, loadAtlasView } from './plugin/atlasLeaves';
import DMScreen from './react/components/DMScreen';
import { AtlasUIContext } from './react/root/AtlasUIContext';
import { ContextMenuProvider } from './react/root/ContextMenuContext';
import { ViewStoreProvider } from './react/ViewStoreContext';
import { runInBackground } from './utils/backgroundTask';
import { observeResize } from './utils/observeResize';

export const DM_SCREEN_VIEW_TYPE = 'atlas-dm-screen';

function ScreenTab({ view, frame }: { view: AtlasView; frame: HTMLElement }): React.JSX.Element {
  const [visible, setVisible] = useState(() => frame.clientWidth > 0);
  useEffect(() => observeResize([frame], () => setVisible(frame.clientWidth > 0)), [frame]);
  const renderer = view.renderer;
  return (
    <ViewStoreProvider store={view.getStore()}>
      <AtlasUIContext.Provider value={{ app: view.app, view, renderer, pixiApp: renderer?.getAppInstance() ?? null }}>
        <ContextMenuProvider local>
          <DMScreen isOpen inTab tabVisible={visible} onClose={() => {}} onLocate={() => {
            runInBackground(view.app.workspace.revealLeaf(view.leaf), 'Showing the map');
          }} />
        </ContextMenuProvider>
      </AtlasUIContext.Provider>
    </ViewStoreProvider>
  );
}

/** A second presentation of the map's store, never an independent copy of the scene. */
export class DMScreenView extends ItemView {
  private root: Root | null = null;
  private map: AtlasView | null = null;
  private ready = false;
  private closed = false;

  getViewType(): string { return DM_SCREEN_VIEW_TYPE; }
  getDisplayText(): string { return t('palette.dmScreenTitle'); }
  getIcon(): string { return 'layout-dashboard'; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.empty();
    this.contentEl.addClass('atlas-vtt-plugin', 'atlas-dm-screen-view');
    this.root = createRoot(this.contentEl);
    this.registerEvent(this.app.workspace.on('layout-change', () => this.followMap()));
    this.app.workspace.onLayoutReady(() => {
      runInBackground(this.startFollowing(), 'Opening the DM screen tab', t('palette.dmScreenWindowFailed'));
    });
  }

  private async startFollowing(): Promise<void> {
    await loadAtlasView(this.app);
    if (this.closed) return;
    this.ready = true;
    this.followMap();
  }

  private followMap(): void {
    if (!this.ready || this.closed) return;
    const map = getLoadedAtlasView(this.app);
    if (!map) {
      if (this.app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE).length === 0) this.leaf.detach();
      return;
    }
    if (map === this.map) return;
    this.map = map;
    this.root?.render(<ScreenTab view={map} frame={this.contentEl} />);
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.ready = false;
    this.map = null;
    this.root?.unmount();
    this.root = null;
  }
}

/** Reuses the screen tab; its scene is always the one in the open Atlas view. */
export async function showDMScreenView(app: App): Promise<void> {
  if (!await loadAtlasView(app)) throw new Error('No Atlas map view is open');
  const existing = app.workspace.getLeavesOfType(DM_SCREEN_VIEW_TYPE)[0];
  if (existing) {
    await app.workspace.revealLeaf(existing);
    return;
  }
  const leaf = app.workspace.openPopoutLeaf();
  await leaf.setViewState({ type: DM_SCREEN_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
}
