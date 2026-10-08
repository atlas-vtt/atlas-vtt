import { ItemView, type WorkspaceLeaf, type ViewStateResult } from 'obsidian';
import { PlayerWindowService } from './services/PlayerWindowService';
import { restorePlayerWindow } from './services/PlayerWindowPresenter';
import { t } from './i18n';
import type { PlayerCameraState } from './types/playerCamera';

export type { PlayerCameraState } from './types/playerCamera';

export const LOCAL_PLAYER_VIEW_TYPE = 'atlas-vtt-local-player';

/** A number a size or a zoom can be: positive, finite, and not so small that dividing by it gives none. */
function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isFinite(1 / value);
}

/**
 * The camera a saved session holds, or none where it holds no usable one. The world rectangle
 * (`width`, `height`) is read only where both sides are sizes: a session an older Atlas saved
 * has none, and its camera then frames what the DM's screen shows.
 */
function readPlayerCamera(value: unknown): PlayerCameraState | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('centerX' in value) || typeof value.centerX !== 'number' || !Number.isFinite(value.centerX)) return null;
  if (!('centerY' in value) || typeof value.centerY !== 'number' || !Number.isFinite(value.centerY)) return null;
  if (!('scale' in value) || !isPositive(value.scale)) return null;
  const camera: PlayerCameraState = { centerX: value.centerX, centerY: value.centerY, scale: value.scale };
  if ('width' in value && 'height' in value && isPositive(value.width) && isPositive(value.height)) {
    camera.width = value.width;
    camera.height = value.height;
  }
  return camera;
}

export interface LocalPlayerSession extends Record<string, unknown> {
  tabId: string;
  filePath: string;
  frozen: boolean;
  /** The camera players saw the scene of `tabId` through last; null once another scene is presented, until a frame of it was shown. */
  camera?: PlayerCameraState | null;
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
    const camera = 'camera' in state ? readPlayerCamera(state.camera) : null;
    if (camera) this.session.camera = camera;
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
