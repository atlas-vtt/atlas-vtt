import type { PlayerFrameSource } from '../../../../src/app/services/PlayerFrameMirror';
import type { PresentedScene } from '../../../../src/app/services/presentedScene';
import { playerWindowStore } from '../../../../src/app/stores/playerWindowStore';

/** The source of a window whose map view closed (`releaseSource`). */
const CLOSED: Pick<PlayerFrameSource, 'store'> = { store: null as unknown as PlayerFrameSource['store'] };

/**
 * Atlas's player window as the presenter drives it, without its frames: open or not, the view it shows, and
 * whether it holds its last frame. Each method changes what `PlayerWindowService`'s own changes of these.
 */
export class FakePlayerWindow {
  static readonly window = { open: true, source: null as Pick<PlayerFrameSource, 'store'> | null, held: false };
  private static readonly instance = new FakePlayerWindow();

  static getInstance(): FakePlayerWindow {
    return FakePlayerWindow.instance;
  }

  static openLeaf(): Promise<null> {
    return Promise.resolve(null);
  }

  static openPlayerView(): null {
    return null;
  }

  /** The window as it is when a test begins: open, showing nothing yet. */
  static reset(): void {
    Object.assign(FakePlayerWindow.window, { open: true, source: null, held: false });
    playerWindowStore.setState({ shownTabId: null });
  }

  /** What players see in the window: nothing, the frame they keep, or a view live; `name` names a view by its store. */
  static shows(name: (store: unknown) => string, tab: (tabId: string) => string): string {
    const { open, source, held } = FakePlayerWindow.window;
    if (!open) return 'closed';
    if (source === CLOSED) return 'held, its view gone';
    if (source === null) return 'nothing';
    const shown = playerWindowStore.getState().shownTabId;
    return held ? 'held' : `live ${name(source.store)} ${shown === null ? '?' : tab(shown)}`;
  }

  isWindowOpen(): boolean {
    return FakePlayerWindow.window.open;
  }

  ownsView(): boolean {
    return false;
  }

  freezeCamera(): void {}

  holdCurrentFrame(): void {
    if (FakePlayerWindow.window.open) FakePlayerWindow.window.held = true;
  }

  releaseSource(store: unknown): void {
    const { window } = FakePlayerWindow;
    if (window.source === null || window.source.store !== store) return;
    this.holdCurrentFrame();
    window.source = CLOSED;
  }

  awaitsSource(): boolean {
    return FakePlayerWindow.window.open && FakePlayerWindow.window.source === CLOSED;
  }

  releaseHeldFrame(source: PlayerFrameSource): void {
    if (!FakePlayerWindow.window.open) return;
    Object.assign(FakePlayerWindow.window, { source, held: false });
  }

  presentCanvas(source: PlayerFrameSource, tabId: string): void {
    if (!FakePlayerWindow.window.open) return;
    Object.assign(FakePlayerWindow.window, { source, held: false });
    playerWindowStore.setState({ shownTabId: tabId });
  }

  attachToView(_view: unknown, source: PlayerFrameSource, scene: PresentedScene): void {
    Object.assign(FakePlayerWindow.window, { source, held: false });
    playerWindowStore.setState({ shownTabId: scene.tabId });
  }
}
