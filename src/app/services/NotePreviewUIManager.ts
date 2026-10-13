import { App, WorkspaceLeaf, TFile, EventRef } from 'obsidian';
import { EventEmitter } from 'events';
import type { FederatedPointerEvent } from 'pixi.js';
import type { NotePin } from '../types';
import type { TokenVitals } from './statblockVitalsSync';
import { NotePreviewWindow } from './NotePreviewWindow';
import { StatblockPreviewWindow } from './StatblockPreviewWindow';
import { hasCreatureForNotePath } from './FantasyStatblocksService';
import { MapLinkPreview } from './MapLinkPreview';
import { linkedFilePath, linkedMapPath, linkedSceneFile } from './sceneLinks';
import { runInBackground } from '../utils/backgroundTask';
import { findAtlasLeafByViewId } from '../utils/atlasLeafLookup';
import { readPinnedNotePreviews } from '../stores/pinnedNotePreviewSlice';
import { isModHeld } from '../keyboard/modKey';
import type { ViewAtlasStore } from '../storeFactory';
import type { TokenRollContext } from '../types/diceRollOrigin';
import { captureRollContext } from '../tools/diceRollOrigins';

/**
 * A hovered token presented to the preview system like a pin on its linked
 * statblock note. The vitals travel with it so the statblock preview can mirror them.
 */
export interface TokenPreviewAnchor extends TokenVitals {
  id: string;
  notePath: string;
  x: number;
  y: number;
  type: 'token';
}

/** What a hover preview is anchored to: a map pin or a token. */
export type PreviewAnchor = NotePin | TokenPreviewAnchor;

/** The part of an anchor a preview window keeps; all a reopened pinned preview has. */
export type PreviewAnchorRef = Pick<PreviewAnchor, 'id' | 'notePath'>;

// Common interface for preview windows
export interface IPreviewWindow {
  notePath: string;
  element: HTMLElement | null;
  originatingPin?: PreviewAnchorRef | null;
  setPosition(x: number, y: number): void;
  getIsPinned(): boolean;
  hide(force?: boolean): void;
}

/** Preview windows cycle below this so they stay under the asset manager (50). */
const MAX_PREVIEW_Z_INDEX = 45;

/**
 * Owns a map view's CMD/Ctrl+hover preview windows. Pinned note previews are
 * saved with the map and reopen, where they were left, whenever it loads.
 */
export class NotePreviewUIManager {
  private app: App;
  private eventBus: EventEmitter;
  private store: ViewAtlasStore;
  private viewId: string;
  /** Set while the asset manager covers the map and the previews are hidden. */
  private suspended = false;
  /**
   * Set from the moment another map starts loading until it has loaded. The
   * store then no longer holds the previews' map, so nothing may be saved into it.
   */
  private mapUnloading = false;
  private activePreviews: Map<string, IPreviewWindow> = new Map();
  private isModifierKeyDown = false;
  private lastHoveredPinId: string | null = null;
  /**
   * Element under the pointer, kept until it leaves; replayed on each CMD/Ctrl press. A
   * hovered token keeps the scene it was hovered in, which rolls from its statblock name.
   */
  private currentHover: {
    pin: PreviewAnchor;
    screenX: number;
    screenY: number;
    sourceLeaf: WorkspaceLeaf | null;
    originContext: TokenRollContext | undefined;
  } | null = null;
  private boundHideAllUnpinnedPreviewsOnBlur!: () => void;
  private boundHandleKeyDown!: (e: KeyboardEvent) => void;
  private boundHandleKeyUp!: (e: KeyboardEvent) => void;
  private boundHandleFocus!: () => void;
  private activeLeafChangeRef: EventRef | null = null;
  private zIndexCounter = 5; // stay below asset manager (50) and Obsidian overlays (~1000)

  constructor(app: App, eventBus: EventEmitter, store: ViewAtlasStore, viewId: string) {
    this.app = app;
    this.eventBus = eventBus;
    this.store = store;
    this.viewId = viewId;

    // Styles are loaded via styles/main.scss → note-preview-window.scss
    this.boundHideAllUnpinnedPreviewsOnBlur = () => this.hideAllUnpinnedPreviews();
    this.initializeGlobalListeners();
  }

  private initializeGlobalListeners(): void {
    this.eventBus.on('pin-hover-preview', (data: {
      pin: PreviewAnchor;
      screenX: number;
      screenY: number;
      pixiEvent?: FederatedPointerEvent;
      sourceLeaf?: WorkspaceLeaf | null;
    }) => {
      // Always update last hovered ID for proper cleanup
      this.lastHoveredPinId = data.pin.id;
      
      // Check the actual key state from the event if available, otherwise fall back to tracked state
      let modifierKeyDown = this.isModifierKeyDown;
      if (data.pixiEvent) {
        modifierKeyDown = isModHeld(data.pixiEvent);
      }
      
      // Hover events only fire when the hovered element changes, so remember
      // the hover: every later modifier press replays it.
      this.currentHover = {
        pin: data.pin, screenX: data.screenX, screenY: data.screenY, sourceLeaf: data.sourceLeaf ?? null,
        originContext: 'type' in data.pin && data.pin.type === 'token'
          ? captureRollContext(this.viewId, this.store.getState(), [data.pin.id])
          : undefined,
      };
      if (modifierKeyDown) {
        this.showPreviewFor(this.currentHover);
      }
    });

    this.eventBus.on('pin-hide-preview', (data: { pin: PreviewAnchor }) => {
      if (this.lastHoveredPinId === data.pin.id) {
          this.lastHoveredPinId = null; // Clear last hovered if mouse moves off it
      }
      if (this.currentHover?.pin.id === data.pin.id) {
        this.currentHover = null;
      }
      // Only hide if not pinned and modifier is not down.
      // If modifier is still down, a new 'pin-hover-preview' will trigger for the new element.
      if (!this.isModifierKeyDown) {
        this.hidePreview(data.pin.id, false); // false = don't force if pinned
      }
    });

    // Bind methods to preserve 'this' context
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleFocus = () => {
      this.isModifierKeyDown = false;
    };
    
    document.addEventListener('keydown', this.boundHandleKeyDown);
    document.addEventListener('keyup', this.boundHandleKeyUp);
    window.addEventListener('blur', this.boundHideAllUnpinnedPreviewsOnBlur);
    
    // Reset modifier key state when window gains focus to avoid stuck state
    window.addEventListener('focus', this.boundHandleFocus);

    // The pin's note opens in the workspace, which replaces its preview
    this.eventBus.on('close-active-preview', (notePath: string) => {
      const preview = this.findPreview(notePath);
      if (preview?.originatingPin) this.store.getState().removePinnedNotePreview(preview.originatingPin.id);
      preview?.hide(true);
    });

    // The map's state is about to be saved and replaced: record how each pinned note was left first
    this.eventBus.on('map-unloading', () => {
      this.savePinnedPreviewStates();
      this.mapUnloading = true;
    });

    this.eventBus.on('map-loaded', () => {
      this.mapUnloading = false;
      this.forgetHover();
      this.restorePinnedPreviews();
    });

    // Leaving the map closes hover previews; pinned ones live in the map's leaf and hide with it
    this.activeLeafChangeRef = this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
      if (!leaf) return;
      // Every map view listens to CMD/Ctrl on the whole document, another map's leaf included
      if (leaf !== findAtlasLeafByViewId(this.app.workspace, this.viewId)) {
        this.forgetHover();
      }
      const viewType = leaf.view?.getViewType?.();
      if (viewType !== 'atlas-vtt' && viewType !== 'atlas-vtt-player') {
        this.hideAllUnpinnedPreviews();
      }
    });
  }

  /**
   * Hover events only fire when the hovered element changes, so the remembered
   * hover must be dropped explicitly once its map is out of sight. Otherwise
   * every later CMD/Ctrl press replays its preview over another map or tab.
   */
  private forgetHover(): void {
    this.currentHover = null;
    this.lastHoveredPinId = null;
  }

  /**
   * Replaces the previous map's previews with the ones pinned on the map that
   * just loaded, at the position and size they were saved with.
   */
  private restorePinnedPreviews(): void {
    this.closeAllPreviews();
    const state = this.store.getState();
    if (state.isPlayerView) return;

    const sourceLeaf = findAtlasLeafByViewId(this.app.workspace, this.viewId);
    for (const saved of readPinnedNotePreviews(state.pinnedNotePreviews)) {
      const preview = new NotePreviewWindow(
        this.app,
        saved.notePath,
        { id: saved.anchorId, notePath: saved.notePath },
        this,
        undefined,
        sourceLeaf,
        saved,
      );
      this.trackNotePreview(preview);
      if (this.suspended) preview.element?.hide();
    }
  }

  /**
   * Saves a pinned preview's position, size, scroll and cursor with the map,
   * or forgets it once unpinned.
   */
  public handlePreviewStateChanged(preview: NotePreviewWindow): void {
    const state = this.store.getState();
    if (this.mapUnloading || state.isPlayerView || !preview.originatingPin) return;
    const pinned = preview.toPinnedNotePreview();
    if (!pinned) {
      state.removePinnedNotePreview(preview.originatingPin.id);
      return;
    }
    // Scrolling reports often; only real changes reach the store and the map file
    const saved = state.pinnedNotePreviews[pinned.anchorId];
    if (JSON.stringify(saved) !== JSON.stringify(pinned)) state.savePinnedNotePreview(pinned);
  }

  /** Records how every pinned note is left, before the map's state is saved. */
  public savePinnedPreviewStates(): void {
    this.activePreviews.forEach((preview) => {
      if (preview instanceof NotePreviewWindow) preview.saveStateNow();
    });
  }

  /** The user closed the preview, so it must not reopen with the map. */
  public handlePreviewDismissed(preview: NotePreviewWindow): void {
    if (preview.originatingPin) this.store.getState().removePinnedNotePreview(preview.originatingPin.id);
  }

  private showPreviewFor(hover: NonNullable<typeof this.currentHover>): void {
    runInBackground(
      this.showOrCreatePreview(hover.pin, hover.screenX, hover.screenY, hover.sourceLeaf, hover.originContext),
      'Showing note preview',
    );
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (isModHeld(e)) {
      const justPressed = !this.isModifierKeyDown;
      this.isModifierKeyDown = true;
      if (justPressed && this.currentHover) {
        this.showPreviewFor(this.currentHover);
      }
    } else if (e.key === 'Escape') {
        this.hideAllUnpinnedPreviews(); // Or all previews including pinned ones
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!isModHeld(e)) {
      this.isModifierKeyDown = false;
      // Always hide all unpinned previews when modifier is released
      this.hideAllUnpinnedPreviews();
    }
  }
  
  /**
   * Forgets a window that closed. Matched by instance, not by key: a window
   * fading out may finish after a new one for the same anchor took its key.
   */
  public handlePreviewClosed(preview: IPreviewWindow): void {
    for (const [key, tracked] of this.activePreviews) {
      if (tracked === preview) this.activePreviews.delete(key);
    }
  }

  public async showOrCreatePreview(
    pin: PreviewAnchor,
    screenX: number,
    screenY: number,
    sourceLeaf?: WorkspaceLeaf | null,
    /** The scene a hovered token was hovered in; a statblock opened for it rolls for that scene. */
    originContext?: TokenRollContext,
  ): Promise<void> {

    // First, check if we already have a preview for this exact pin
    const existingPreviewForPin = Array.from(this.activePreviews.values()).find(
      p => p.originatingPin?.id === pin.id
    );
    
    if (existingPreviewForPin) {
      // If it's unpinned, update its position
      if (!existingPreviewForPin.getIsPinned()) {
        existingPreviewForPin.setPosition(screenX, screenY);
        this.raiseZIndex(existingPreviewForPin);
      } else {
        // If it's pinned, just bring it to front without moving
        this.raiseZIndex(existingPreviewForPin);
      }
      return;
    }

    // Hide all unpinned previews before creating a new one
    this.hideAllUnpinnedPreviews();
    
    // Scene links → lightweight tooltip with thumbnail + "Open Map" button; nothing for a scene not in this collection
    if (linkedMapPath(pin.notePath)) {
      const scene = linkedSceneFile(this.app, this.store.getState().mapPath, pin.notePath);
      const mapPreview = scene ? new MapLinkPreview(this.app, scene, pin, this, { x: screenX, y: screenY }) : null;
      if (mapPreview?.element) {
        this.activePreviews.set(`${pin.notePath}::${pin.id}`, mapPreview);
        this.raiseZIndex(mapPreview);
      }
      return;
    }

    // Check file type for specialized previews
    const file = this.app.vault.getAbstractFileByPath(linkedFilePath(pin.notePath));
    if (file instanceof TFile) {

      // Notes backed by a Fantasy Statblocks creature → rich statblock preview for tokens
      const isStatblock = hasCreatureForNotePath(file.path);

      if (isStatblock && 'type' in pin && pin.type === 'token') {
        const statblockPreview = new StatblockPreviewWindow(
          this.app, 
          pin.notePath, 
          pin,
          this, 
          { x: screenX, y: screenY },
          undefined,
          this.viewId,
          originContext,
        );
        
        if (statblockPreview.element) {
          const previewKey = `${pin.notePath}::${pin.id}`;
          this.activePreviews.set(previewKey, statblockPreview);
          this.raiseZIndex(statblockPreview);
          statblockPreview.element.addEventListener('mousedown', () => this.raiseZIndex(statblockPreview));
        } else {
          console.warn('[NotePreviewUIManager] Statblock preview element is null');
        }
        return;
      }
    }
    
    // Create a normal note preview window
    this.trackNotePreview(new NotePreviewWindow(
      this.app,
      pin.notePath,
      pin,
      this,
      { x: screenX, y: screenY },
      sourceLeaf ?? null,
    ));
  }

  private trackNotePreview(preview: NotePreviewWindow): void {
    const anchor = preview.originatingPin;
    if (!preview.element || !anchor) return;
    // Keyed by note path and pin ID so several pins of one note can each have a preview
    this.activePreviews.set(`${anchor.notePath}::${anchor.id}`, preview);
    this.raiseZIndex(preview);
    preview.element.addEventListener('mousedown', () => this.raiseZIndex(preview));
  }

  /**
   * Incremental z-index raise so the focused preview stays on top
   */
  private raiseZIndex(preview: IPreviewWindow): void {
    this.zIndexCounter = (this.zIndexCounter + 1) % MAX_PREVIEW_Z_INDEX;
    if (this.zIndexCounter < 5) this.zIndexCounter = 5; // maintain minimum

    if (preview.element) {
      preview.element.style.zIndex = `${this.zIndexCounter}`;
    }
  }

  private findPreview(notePathOrPinId: string): IPreviewWindow | undefined {
    for (const [key, p] of this.activePreviews.entries()) {
      if (p.originatingPin?.id === notePathOrPinId || p.notePath === notePathOrPinId || key === notePathOrPinId) {
        return p;
      }
    }
    return undefined;
  }

  public hidePreview(notePathOrPinId: string, force: boolean = false): void {
    const preview = this.findPreview(notePathOrPinId);
    if (preview) {
      if (!preview.getIsPinned() || force) {
        preview.hide();
        // Note: The preview will call handlePreviewClosed which will remove it from the map
      }
    }
  }

  public hideAllUnpinnedPreviews(excludeNotePath?: string | null): void {
    this.activePreviews.forEach((preview) => {
      if (preview.notePath === excludeNotePath && this.isModifierKeyDown) return; // Don't hide if it's the current hover target & mod down
      if (!preview.getIsPinned()) {
        preview.hide();
      }
    });
  }
  
  /** Closes every window, pinned ones included, without forgetting what the map saved. */
  private closeAllPreviews(): void {
    this.activePreviews.forEach((preview) => preview.hide(true));
    this.activePreviews.clear();
  }

  /**
   * Clears previews out of the way while the asset manager covers the map:
   * hover previews close, pinned ones are only hidden until `resumePreviews`.
   */
  public suspendPreviews(): void {
    this.suspended = true;
    this.hideAllUnpinnedPreviews();
    this.activePreviews.forEach((preview) => preview.element?.hide());
  }

  /** Shows the pinned previews hidden by `suspendPreviews` again. */
  public resumePreviews(): void {
    this.suspended = false;
    this.activePreviews.forEach((preview) => preview.element?.show());
  }

  public destroy(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('keyup', this.boundHandleKeyUp);
    window.removeEventListener('blur', this.boundHideAllUnpinnedPreviewsOnBlur);
    window.removeEventListener('focus', this.boundHandleFocus);
    if (this.activeLeafChangeRef) {
      this.app.workspace.offref(this.activeLeafChangeRef);
      this.activeLeafChangeRef = null;
    }
    this.closeAllPreviews();
  }
}
