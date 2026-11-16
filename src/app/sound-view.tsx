import { ItemView, type App } from 'obsidian';
import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { t } from './i18n';
import { SoundPane } from './react/components/dm-screen/sound/SoundPane';
import { useExperimentalFeature } from './react/hooks/useExperimentalFeature';
import { AtlasUIContext } from './react/root/AtlasUIContext';
import { ContextMenuProvider } from './react/root/ContextMenuContext';
import { observeResize } from './utils/observeResize';

export const SOUND_VIEW_TYPE = 'atlas-sound';

/** The page while sound is switched on. Another tab in front measures this one 0 wide, and meters are read only while someone looks. */
function SoundPage({ frame }: { frame: HTMLElement }): React.JSX.Element | null {
  const on = useExperimentalFeature('sound');
  const [shown, setShown] = useState(() => frame.clientWidth > 0);
  useEffect(() => observeResize([frame], () => setShown(frame.clientWidth > 0)), [frame]);
  return on ? <SoundPane active={shown} /> : null;
}

/**
 * The DM screen's Sound page in a tab of its own, for a GM preparing music with no map open. What it
 * shows belongs to the app's `SoundDirector` and `SoundLibrary`, so it follows the same state as a DM
 * screen beside it, and closing it stops nothing.
 */
export class SoundView extends ItemView {
  private root: Root | null = null;

  getViewType(): string {
    return SOUND_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('audio.screen.sound');
  }

  getIcon(): string {
    return 'music';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('atlas-vtt-plugin', 'atlas-sound-view');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <AtlasUIContext.Provider value={{ app: this.app, view: null, pixiApp: null, renderer: null }}>
        <ContextMenuProvider local>
          <SoundPage frame={this.contentEl} />
        </ContextMenuProvider>
      </AtlasUIContext.Provider>,
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}

/** Opens the Sound page in its tab: the one already open, else a new one. */
export async function showSoundView(app: App): Promise<void> {
  const leaf = app.workspace.getLeavesOfType(SOUND_VIEW_TYPE)[0] ?? app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: SOUND_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
}
