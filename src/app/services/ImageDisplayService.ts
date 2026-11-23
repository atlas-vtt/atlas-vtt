import { App, Menu, TFile, type EventRef } from 'obsidian';
import { openContextMenuGlobal, type ContextMenuEntry } from '../react/root/ContextMenuContext';
import { PlayerWindowService } from './PlayerWindowService';
import { playImageEnter, playImageExit } from './imageDisplayMotion';
import { ImageOverlayControls } from './imageOverlayControls';
import { SettingsService } from './SettingsService';
import { tableTvOf } from './tableTvFrame';
import './image-display.scss';
import { t } from '../i18n';
import { DECODED_MAX_PIXELS, DECODER_MAX_SIDE, decodable } from '../imageProcessing/decodeLimits';
import { imageHeader } from '../imageProcessing/imageDimensions';
import { showNotice } from '../ui/notice';
import { statblockImageAt } from './statblockImageTarget';
import { playerWindowStore } from '../stores/playerWindowStore';
import { isResourceUrl, resourceUrlToFilePath, resourceUrlToVaultPath } from '../utils/pathUtils';
import { canCopyItems } from '../platform/clipboardWrites';
import { desktopOnly, isDesktopApp } from '../platform/desktopOnly';
import { vaultBasePath } from '../platform/vaultBasePath';

/** An image overlay in the player window. */
interface ImageDisplay {
  container: HTMLDivElement;
  stage: HTMLDivElement;
  imageUrl: string;
}

/** Atlas' own elements; the document's root and body carry Atlas classes too (hidden chrome, a preview shown), and are none. */
const ATLAS_UI = ':not(body):not(html)[class*="atlas-"]';
const NOTE_CONTENT = '.markdown-rendered, .markdown-source-view, .markdown-preview-view';

/** Whether `target` lies in Atlas' own UI, whose images stay its own; a note Atlas shows (its note preview) is the GM's content. */
function inAtlasUi(target: Element): boolean {
  const atlas = target.closest(ATLAS_UI);
  if (!atlas) return false;
  const note = target.closest(NOTE_CONTENT);
  return !(note && atlas.contains(note));
}

export class ImageDisplayService {
  private app: App;
  private static instance: ImageDisplayService | null = null;
  private imageContainer: HTMLDivElement | null = null;
  private currentImage: HTMLImageElement | null = null;
  /** Wraps the image so the entrance can animate while the image's own transform pans and zooms. */
  private imageStage: HTMLDivElement | null = null;
  /** Overlays still fading out after being closed or replaced. */
  private leavingDisplays = new Set<ImageDisplay>();
  private controls: ImageOverlayControls | null = null;
  private boundHandleContextMenu: (event: MouseEvent) => void;
  private boundStoreContextMenuTarget: (event: MouseEvent) => void;
  private lastContextMenuTarget: HTMLElement | null = null;
  private contextMenuEventRefs: EventRef[] = [];
  private contextMenuRegistered = false;

  constructor(app: App) {
    this.app = app;
    ImageDisplayService.instance = this;
    this.boundHandleContextMenu = this.handleContextMenu.bind(this);
    this.boundStoreContextMenuTarget = (e: MouseEvent): void => { this.lastContextMenuTarget = e.target as HTMLElement; };
  }

  public static getInstance(): ImageDisplayService | null {
    return ImageDisplayService.instance;
  }

  /**
   * Register context menu handler for image files
   */
  public registerContextMenu(): void {
    if (this.contextMenuRegistered) {
      return;
    }

    this.contextMenuRegistered = true;

    // Register for file menu (in file explorer)
    const fileMenuRef = this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && this.isImageFile(file)) {
        this.addImageDisplayMenuItem(menu, file);
      }
    });
    this.contextMenuEventRefs.push(fileMenuRef);

    // Register for link context menu (unofficial Obsidian event)
    const linkMenuRef = this.app.workspace.on('link-menu', (menu, linktext, sourcePath) => {
      const file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
      if (file instanceof TFile && this.isImageFile(file)) {
        this.addImageDisplayMenuItem(menu, file);
      }
    });
    this.contextMenuEventRefs.push(linkMenuRef);

    // Capture-phase listener to track right-click target (runs before Obsidian's handlers)
    document.addEventListener('contextmenu', this.boundStoreContextMenuTarget, true);

    // Register for editor context menu (fires on right-click in markdown views)
    // This adds our item to Obsidian's native menu for rendered image embeds (![[image.png]])
    const editorMenuRef = this.app.workspace.on('editor-menu', (menu: Menu) => {
      const target = this.lastContextMenuTarget;
      // Holding the element would keep its whole (possibly closed) view in memory
      this.lastContextMenuTarget = null;
      if (!target) return;

      const result = this.resolveImageFromTarget(target);
      if (!result) return;

      this.addImageDisplayMenuItem(menu, result.file);
      if (canCopyItems()) {
        menu.addItem((item) => {
          item.setTitle(t('image.copy')).setIcon('copy').onClick(() => this.copyImageToClipboard(result.imgElement));
        });
      }
      if (!isDesktopApp()) return;
      menu.addItem((item) => {
        item.setTitle(t('image.openDefault')).setIcon('external-link').onClick(() => this.app.openWithDefaultApp(result.file.path));
      });
    });
    this.contextMenuEventRefs.push(editorMenuRef);

    // Fallback: listen for context menu events on direct image views (non-editor contexts)
    document.addEventListener('contextmenu', this.boundHandleContextMenu, false);
  }


  /**
   * Resolve a right-click target to an image file and its IMG element.
   * Handles rendered embeds (![[image.png]]) and direct IMG clicks.
   */
  private resolveImageFromTarget(target: Element): { file: TFile; imgElement: HTMLImageElement } | null {
    if (target.closest('.modal-container')) return null;
    // Atlas' own UI keeps its images to itself, but a statblock's pictures are content.
    let imgElement = statblockImageAt(target);
    if (!imgElement && inAtlasUi(target)) return null;

    if (target.tagName === 'IMG') {
      imgElement = target as HTMLImageElement;
    }

    const imageEmbed = target.closest('.internal-embed.image-embed');
    if (!imgElement && imageEmbed) {
      imgElement = imageEmbed.querySelector('img');
    }

    if (!imgElement) return null;

    // Method 1: Extract from src URL
    const filePath = this.extractFilePathFromSrc(imgElement.src);
    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile && this.isImageFile(file)) return { file, imgElement };
    }

    // Method 2: Resolve from embed's src/data-src attribute via metadata cache
    if (imageEmbed) {
      const dataSrc = imageEmbed.getAttribute('src') || imageEmbed.getAttribute('data-src');
      if (dataSrc) {
        const resolved = this.app.metadataCache.getFirstLinkpathDest(dataSrc, '');
        if (resolved instanceof TFile && this.isImageFile(resolved)) return { file: resolved, imgElement };

        const file = this.app.vault.getAbstractFileByPath(dataSrc);
        if (file instanceof TFile && this.isImageFile(file)) return { file, imgElement };
      }
    }

    return null;
  }

  /**
   * Fallback handler for direct image views (non-editor contexts like viewing an image file).
   * Rendered image embeds in markdown are handled by the editor-menu handler instead.
   */
  private handleContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('.modal-container')) return;

    // In markdown views, the editor-menu handler adds items to Obsidian's native menu
    const isInMarkdownView = target.closest('.markdown-preview-view') ||
                            target.closest('.markdown-source-view') ||
                            target.closest('.markdown-reading-view');
    if (isInMarkdownView) return;

    // A statblock's picture in a statblock preview or the DM screen, unless a menu of its own took the click
    const statblockImage = this.statblockImageFileAt(target);
    if (statblockImage) {
      if (!event.defaultPrevented) this.openImageMenu(event, statblockImage.file, statblockImage.imgElement);
      return;
    }

    const viewed = this.viewedImageAt(target);
    if (viewed) this.openImageMenu(event, viewed.file, viewed.imgElement);
  }

  /** The image of an image file's own tab under `target` (not Atlas' UI); null anywhere else. */
  private viewedImageAt(target: Element): { file: TFile; imgElement: HTMLImageElement } | null {
    // Atlas' own UI keeps its images to itself
    if (inAtlasUi(target)) return null;

    // Only handle direct image viewing (e.g. clicking an image file in a tab)
    const viewContent = target.closest('.view-content');
    if (!viewContent || target.closest('.atlas-vtt')) return null;

    if (!viewContent.closest('.workspace-leaf')) return null;

    const imgElement = viewContent.querySelector('img');
    if (!imgElement) return null;

    // Try to resolve the image file
    let imageFile = this.imageFileOf(imgElement);

    if (!imageFile) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && this.isImageFile(activeFile)) {
        const leafEl = target.closest('.workspace-leaf');
        const activeLeafEl = document.querySelector('.workspace-leaf.mod-active');
        if (leafEl === activeLeafEl) imageFile = activeFile;
      }
    }

    return imageFile ? { file: imageFile, imgElement } : null;
  }

  /**
   * The vault image under `target` that the image menus offer to show to the players: a rendered
   * embed or picture in a note, a statblock's picture, an image file's own tab. Null for anything
   * else, Atlas' own UI and pictures from the web included.
   */
  public imageFileAt(target: Element): TFile | null {
    if (target.closest('.modal-container')) return null;
    return (this.resolveImageFromTarget(target) ?? this.viewedImageAt(target))?.file ?? null;
  }

  /**
   * The vault image of a statblock's picture under a right-click, which this
   * service's menu offers to show to the players; null for anything else, a
   * picture from the web included.
   */
  public statblockImageFileAt(target: Element): { file: TFile; imgElement: HTMLImageElement } | null {
    const imgElement = statblockImageAt(target);
    const file = imgElement ? this.imageFileOf(imgElement) : null;
    return imgElement && file ? { file, imgElement } : null;
  }

  /** The vault image an `<img>` shows, or null for one from elsewhere. */
  private imageFileOf(imgElement: HTMLImageElement): TFile | null {
    const filePath = this.extractFilePathFromSrc(imgElement.src);
    const file = filePath ? this.app.vault.getAbstractFileByPath(filePath) : null;
    return file instanceof TFile && this.isImageFile(file) ? file : null;
  }

  /** Atlas' menu for an image: show it to the players, copy it, open it outside Obsidian. */
  private openImageMenu(event: MouseEvent, file: TFile, imgElement: HTMLImageElement): void {
    event.preventDefault();
    event.stopPropagation();

    const entries: ContextMenuEntry[] = [
      ...desktopOnly<ContextMenuEntry>({ type: 'item', label: t('image.display'), icon: 'monitor', onClick: () => this.displayImageOnPlayerView(file) }),
      ...(canCopyItems() ? [{ type: 'item' as const, label: t('image.copy'), icon: 'copy', onClick: () => this.copyImageToClipboard(imgElement) }] : []),
      ...desktopOnly<ContextMenuEntry>({ type: 'item', label: t('image.openDefaultMenu'), icon: 'external-link', onClick: () => this.app.openWithDefaultApp(file.path) }),
    ];

    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  }
  
  /**
   * Copy image to clipboard
   */
  private async copyImageToClipboard(imgElement: HTMLImageElement): Promise<void> {
    try {
      // The clipboard is asked within the press, as WebKit demands, and takes the picture once it is drawn.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.renderImageAsPng(imgElement.src) })]);
      showNotice(t('image.copied'));
    } catch (error) {
      console.error('Failed to copy image:', error);
      showNotice(t('image.copyFailed'));
    }
  }

  /** Re-encodes an image as PNG, the only image type the clipboard accepts. */
  private renderImageAsPng(src: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = (): void => {
        const canvas = createEl('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context is unavailable'));
          return;
        }
        ctx.drawImage(image, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode the image'))), 'image/png');
      };
      image.onerror = (): void => reject(new Error(`Failed to load image ${src}`));
      image.src = src;
    });
  }

  /**
   * Add menu item to display image on player view; none where there is no player window (mobile).
   */
  private addImageDisplayMenuItem(menu: Menu, file: TFile): void {
    if (!isDesktopApp()) return;
    menu.addItem((item) => {
      item
        .setTitle(t('image.display'))
        .setIcon('monitor')
        .onClick(async () => {
          await this.displayImageOnPlayerView(file);
        });
    });
  }

  /**
   * Display image on the player view window
   */
  public async displayImageOnPlayerView(file: TFile): Promise<void> {
    const playerWindowService = PlayerWindowService.getInstance();
    
    if (!playerWindowService || !playerWindowService.isWindowOpen()) {
      showNotice(t('image.windowClosed'));
      return;
    }

    try {
      // Read the image file
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer], { type: this.getMimeType(file.extension) });
      // An image the browser cannot open would end the player window; it is shown nowhere but as map tiles.
      const header = await imageHeader(blob);
      if (header && !decodable(header)) {
        showNotice(t('image.tooLarge', { width: header.width, height: header.height, megapixels: Math.floor(DECODED_MAX_PIXELS / 1e6), side: DECODER_MAX_SIDE }));
        return;
      }
      const imageUrl = URL.createObjectURL(blob);

      // Get the player window
      const playerWindow = playerWindowService.getWindow();
      if (!playerWindow) {
        showNotice(t('image.windowUnavailable'));
        return;
      }

      // Create or update the image display
      this.createImageDisplay(playerWindow, imageUrl, file.name);
      
    } catch (error) {
      console.error('[ImageDisplayService] Error displaying image:', error);
      showNotice(t('image.displayFailed'));
    }
  }

  /**
   * Create the image display overlay in the player window
   */
  private createImageDisplay(playerWindow: Window, imageUrl: string, fileName: string): void {
    const doc = playerWindow.document;
    const previous = this.detachImageDisplay();

    this.imageContainer = doc.body.createDiv({ cls: 'atlas-image-display' });
    // The image's own colours behind it while the curtain hides the map (`image-display.scss`)
    this.imageContainer.createEl('img', { cls: 'atlas-image-display__backdrop', attr: { src: imageUrl, alt: '', 'aria-hidden': 'true' } });
    // Turns with a table TV (the body's --atlas-tv-rotation); the close button stays on the window
    const turn = this.imageContainer.createDiv({ cls: 'atlas-image-display__turn' });
    this.imageStage = turn.createDiv({ cls: 'atlas-image-display__stage' });
    this.currentImage = this.imageStage.createEl('img', { cls: 'atlas-image-display__image' });
    this.currentImage.src = imageUrl;

    const closeButton = this.imageContainer.createEl('button', { cls: 'atlas-image-display__close', text: '×' });
    closeButton.setAttribute('aria-label', t('common.close'));
    closeButton.addEventListener('click', () => this.closeImageDisplay());

    const settings = SettingsService.forApp(this.app);
    const turnOf = (): number => (settings ? tableTvOf(playerWindow, settings.getTableTvSettings(), settings.getTableTvDevice()).rotation : 0);
    this.controls = new ImageOverlayControls(this.imageContainer, this.currentImage, playerWindow, () => this.closeImageDisplay(), turnOf);

    // A replaced image leaves above the new one, so the scrim stays dark while they crossfade
    previous?.container.before(this.imageContainer);
    playerWindowStore.setState({ imageShown: true });
    const entrance = playImageEnter(this.imageContainer, this.imageStage, this.currentImage, previous !== null);
    // The previous image stays until the new one can paint, so the crossfade never shows an empty scrim
    if (previous) void this.leave(previous, entrance);
  }

  /**
   * Close the image display. `quiet` says nothing, for a control whose own change shows it (the player window bar).
   */
  public closeImageDisplay(options?: { quiet?: boolean }): void {
    const display = this.detachImageDisplay();
    if (!display) return;
    if (!options?.quiet) showNotice(t('image.closed'));
    void this.leave(display);
  }
  
  /**
   * Check if an image is currently being displayed
   */
  public isImageDisplayed(): boolean {
    return this.imageContainer !== null;
  }

  /**
   * Check if file is an image
   */
  private isImageFile(file: TFile): boolean {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
    return imageExtensions.includes(file.extension.toLowerCase());
  }

  /**
   * Extract file path from image src URL
   */
  private extractFilePathFromSrc(src: string): string | null {
    try {
      // A resource URL: the file's place in the vault, else its path on disk
      if (isResourceUrl(src)) {
        return resourceUrlToVaultPath(src, vaultBasePath(this.app.vault.adapter)) ?? resourceUrlToFilePath(src);
      }

      // Handle vault:// URLs
      const vaultMatch = src.match(/vault:\/\/(.+)/);
      if (vaultMatch?.[1]) {
        return decodeURIComponent(vaultMatch[1]);
      }
      
      // Handle Obsidian's custom protocols (obsidian://...)
      if (src.startsWith('obsidian://')) {
        const url = new URL(src);
        const path = url.searchParams.get('path');
        if (path) {
          return decodeURIComponent(path);
        }
      }
      
      // Handle data URLs by looking at the alt attribute or other metadata
      if (src.startsWith('data:')) {
        // For data URLs, we can't extract a file path directly
        // We'll need to handle this case differently
        return null;
      }
      
      // Handle relative paths
      if (!src.includes('://')) {
        return decodeURIComponent(src);
      }
    } catch (e) {
      console.error('Error extracting file path from src:', e);
    }
    
    return null;
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'webp': 'image/webp'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'image/png';
  }

  /**
   * Destroy the service
   */
  public destroy(): void {
    this.disposeImageDisplay();

    document.removeEventListener('contextmenu', this.boundStoreContextMenuTarget, true);
    document.removeEventListener('contextmenu', this.boundHandleContextMenu, false);
    this.lastContextMenuTarget = null;

    this.contextMenuEventRefs.forEach((eventRef) => {
      this.app.workspace.offref(eventRef);
    });
    this.contextMenuEventRefs = [];
    this.contextMenuRegistered = false;

    ImageDisplayService.instance = null;
  }

  /** Removes every overlay at once, including ones still fading out. */
  private disposeImageDisplay(): void {
    const display = this.detachImageDisplay();
    if (display) this.removeImageDisplay(display);
    for (const leaving of this.leavingDisplays) this.removeImageDisplay(leaving);
    this.leavingDisplays.clear();
  }

  /** Stops the shown overlay from reacting to input and hands it back for its exit, or null when none is shown. */
  private detachImageDisplay(): ImageDisplay | null {
    if (!this.imageContainer || !this.imageStage || !this.currentImage) return null;
    this.controls?.detach();
    this.controls = null;
    const display: ImageDisplay = { container: this.imageContainer, stage: this.imageStage, imageUrl: this.currentImage.src };
    // A leaving overlay may sit above the next image; let input reach that one
    display.container.addClass('is-leaving');
    this.imageContainer = null;
    this.imageStage = null;
    this.currentImage = null;
    playerWindowStore.setState({ imageShown: false });
    return display;
  }

  private async leave(display: ImageDisplay, after?: Promise<void>): Promise<void> {
    this.leavingDisplays.add(display);
    await after;
    // Removed at once meanwhile (destroy)
    if (!this.leavingDisplays.has(display)) return;
    await playImageExit(display.container, display.stage, after !== undefined);
    if (!this.leavingDisplays.delete(display)) return;
    this.removeImageDisplay(display);
  }

  private removeImageDisplay(display: ImageDisplay): void {
    display.container.remove();
    URL.revokeObjectURL(display.imageUrl);
  }
}
