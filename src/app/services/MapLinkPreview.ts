import { App, TFile, setIcon } from 'obsidian';
import type { NotePreviewUIManager, PreviewAnchor } from './NotePreviewUIManager';
import './map-link-preview.scss';
import { runInBackground } from '../utils/backgroundTask';
import { t } from '../i18n';
import { mapThumbnailPath } from '../utils/dataFileMigration';
import { showPinnedLevel } from '../links/openAtlasLink';
import { placeHoverCard } from './hoverCardPlacement';

/**
 * Lightweight tooltip-style preview for .atlasmap files linked via note pins.
 * Shows the map thumbnail edge-to-edge with an overlaid "Open Map" button.
 * Dismisses on mouse leave (no pinning/dragging).
 */
export class MapLinkPreview {
  public notePath: string;
  public originatingPin: PreviewAnchor;
  private app: App;
  private file: TFile;
  private manager: NotePreviewUIManager;
  private wrapperEl: HTMLElement | null = null;
  private cardEl: HTMLElement | null = null;
  private hideTimeout: number | null = null;
  private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private originX: number;
  private originY: number;

  /** Delay (ms) before the preview hides after mouse leaves. */
  private static readonly HIDE_DELAY = 150;

  /** `doc`: the document of the window the pin was hovered in, which may be a popout's. */
  constructor(app: App, file: TFile, pin: PreviewAnchor, manager: NotePreviewUIManager, position: { x: number; y: number }, private readonly doc: Document = document) {
    this.app = app;
    this.file = file;
    this.notePath = file.path;
    this.originatingPin = pin;
    this.manager = manager;
    this.originX = position.x;
    this.originY = position.y;
    this.render(position);
  }

  // ── IPreviewWindow ─────────────────────────────────────────────────────

  get element(): HTMLElement | null {
    return this.wrapperEl;
  }

  setPosition(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.positionAt(x, y);
  }

  getIsPinned(): boolean {
    return false; // Tooltip-style preview is never pinned
  }

  hide(force?: boolean): void {
    if (!this.cardEl) return;
    this.cardEl.classList.add('atlas-map-link-preview--closing');
    this.cardEl.addEventListener('animationend', () => this.destroy(), { once: true });
  }

  destroy(): void {
    this.clearHideTimeout();
    if (this.escapeHandler) {
      this.doc.removeEventListener('keydown', this.escapeHandler, true);
      this.escapeHandler = null;
    }
    this.wrapperEl?.remove();
    this.manager.handlePreviewClosed(this);
    this.wrapperEl = null;
    this.cardEl = null;
  }

  /** Schedule a delayed hide — cancellable if the mouse enters the card. */
  scheduleHide(): void {
    this.clearHideTimeout();
    this.hideTimeout = window.setTimeout(() => this.hide(), MapLinkPreview.HIDE_DELAY);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private render(position: { x: number; y: number }): void {
    // Outer wrapper for SCSS scoping (all styles are nested under .atlas-vtt-plugin)
    this.wrapperEl = this.doc.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

    // Inner card — carries the actual visual styles
    this.cardEl = this.wrapperEl.createDiv({ cls: 'atlas-map-link-preview' });

    // Mouse enter/leave for tooltip behaviour
    this.cardEl.addEventListener('mouseenter', () => this.clearHideTimeout());
    this.cardEl.addEventListener('mouseleave', () => this.scheduleHide());

    // Escape key dismisses
    this.escapeHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    };
    this.doc.addEventListener('keydown', this.escapeHandler, true);

    this.buildContent();

    // Position after appending so we can measure dimensions
    this.positionAt(position.x, position.y);
  }

  private buildContent(): void {
    if (!this.cardEl) return;

    const thumbnailPath = mapThumbnailPath(this.file.path);
    const thumbnailFile = this.app.vault.getAbstractFileByPath(thumbnailPath);

    if (thumbnailFile instanceof TFile) {
      const thumbnailUrl = this.app.vault.getResourcePath(thumbnailFile);

      // Thumbnail image (edge-to-edge, natural aspect ratio)
      const img = this.cardEl.createEl('img', {
        cls: 'atlas-map-link-preview__image',
        attr: { src: thumbnailUrl, alt: this.file.basename },
      });

      // Re-position once the image loads (we now know the real height)
      img.addEventListener('load', () => {
        this.positionAt(this.originX, this.originY);
      }, { once: true });

      // Gradient overlay with Open Map button
      const overlay = this.cardEl.createDiv({ cls: 'atlas-map-link-preview__overlay' });
      const button = overlay.createEl('button', {
        text: t('mapPreview.open'),
        cls: 'atlas-map-link-preview__button',
      });
      button.addEventListener('click', () => {
        runInBackground(this.openMap(), `Opening map ${this.file.path}`, t('mapPreview.openFailed'));
      });
    } else {
      this.buildPlaceholder();
    }
  }

  private buildPlaceholder(): void {
    if (!this.cardEl) return;

    const placeholder = this.cardEl.createDiv({ cls: 'atlas-map-link-preview__placeholder' });

    const iconEl = placeholder.createDiv({ cls: 'atlas-map-link-preview__placeholder-icon' });
    setIcon(iconEl, 'map');

    placeholder.createDiv({
      cls: 'atlas-map-link-preview__placeholder-name',
      text: this.file.basename,
    });

    placeholder.createDiv({
      cls: 'atlas-map-link-preview__placeholder-desc',
      text: t('mapPreview.title'),
    });

    const button = placeholder.createEl('button', {
      text: t('mapPreview.open'),
      cls: 'atlas-map-link-preview__button',
    });
    button.addEventListener('click', () => {
        runInBackground(this.openMap(), `Opening map ${this.file.path}`, t('mapPreview.openFailed'));
      });
  }

  /** Position the card near the given screen coordinates, clamped to viewport. */
  private positionAt(x: number, y: number): void {
    if (this.cardEl) placeHoverCard(this.cardEl, x, y);
  }

  private async openMap(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType('atlas-vtt');
    const targetLeaf = leaves[0] ?? this.app.workspace.getLeaf(true);

    await targetLeaf.setViewState({
      type: 'atlas-vtt',
      state: { file: this.file.path },
    });
    this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
    this.hide();
    // A token anchor names no level: the scene opens as it opens.
    if ('sceneLevel' in this.originatingPin) await showPinnedLevel(this.app, this.file.path, this.originatingPin);
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout !== null) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}
