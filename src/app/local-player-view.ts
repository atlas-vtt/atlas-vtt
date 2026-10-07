import { ItemView, type WorkspaceLeaf, type ViewStateResult } from 'obsidian';
import { PlayerWindowService } from './services/PlayerWindowService';
import { restorePlayerWindow } from './services/PlayerWindowPresenter';
import { t } from './i18n';
import type { PlayerCameraState } from './types/playerCamera';

export type { PlayerCameraState } from './types/playerCamera';

export const LOCAL_PLAYER_VIEW_TYPE = 'atlas-vtt-local-player';

function isPlayerCamera(value: unknown): value is PlayerCameraState {
  if (typeof value !== 'object' || value === null) return false;
  return 'centerX' in value && typeof value.centerX === 'number' && Number.isFinite(value.centerX)
    && 'centerY' in value && typeof value.centerY === 'number' && Number.isFinite(value.centerY)
    && 'scale' in value && typeof value.scale === 'number' && Number.isFinite(value.scale) && value.scale > 0;
}

export interface LocalPlayerSession extends Record<string, unknown> {
  tabId: string;
  filePath: string;
  frozen: boolean;
  camera?: PlayerCameraState;
}

/** A real workspace leaf lets Obsidian restore the presentation and window geometry. */
export class LocalPlayerView extends ItemView {
  private session: LocalPlayerSession = { tabId: '', filePath: '', frozen: false };
  public isClosed = false;
  private restoreTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return LOCAL_PLAYER_VIEW_TYPE; }
  getDisplayText(): string { return t('view.player'); }
  getIcon(): string { return 'presentation'; }
  getState(): LocalPlayerSession { return { ...this.session }; }

  updateSession(state: Partial<LocalPlayerSession>): void {
    this.session = { ...this.session, ...state };
    this.app.workspace.requestSaveLayout();
  }

  async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    if (typeof state !== 'object' || state === null) return;
    if (!('tabId' in state) || typeof state.tabId !== 'string') return;
    if (!('filePath' in state) || typeof state.filePath !== 'string') return;
    this.session = { tabId: state.tabId, filePath: state.filePath, frozen: 'frozen' in state && state.frozen === true };
    if ('camera' in state && isPlayerCamera(state.camera)) this.session.camera = { ...state.camera };
    this.app.workspace.onLayoutReady(() => {
      if (this.isClosed) return;
      if (this.restoreTimer !== null) window.clearTimeout(this.restoreTimer);
      // A newly opened window is attached by the presenter before this task runs.
      this.restoreTimer = window.setTimeout(() => {
        this.restoreTimer = null;
        if (!this.isClosed) void restorePlayerWindow(this.app, this).catch((error: unknown) => {
          console.error('[LocalPlayerView] Could not restore presentation:', error);
          this.contentEl.setText(t('view.playerRestoreFailed'));
        });
      }, 0);
    });
  }

  async onOpen(): Promise<void> {
    this.isClosed = false;
    this.contentEl.addClass('atlas-local-player-content');
    this.contentEl.setText(t('view.connecting'));
    if (this.contentEl.win !== window) this.contentEl.doc.body.addClass('atlas-player-window');
  }

  async onClose(): Promise<void> {
    this.isClosed = true;
    if (this.restoreTimer !== null) window.clearTimeout(this.restoreTimer);
    const service = PlayerWindowService.getInstance();
    if (service?.ownsView(this)) service.destroy(false);
    this.contentEl.doc.body.removeClass('atlas-player-window', 'atlas-player-window--live');
    this.contentEl.empty();
  }
}
