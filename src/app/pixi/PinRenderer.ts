import { Container, Graphics, FederatedPointerEvent, Circle, Text, Sprite, Texture, TextStyle } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { EventEmitter } from 'events';
import type { NotePin } from "../types";
import { createPinIconTexture } from "./utils/pinIconTexture";
import { destroyTree } from "./utils/destroyTree";
import { mapMarkerScale } from "./utils/mapMarkerScale";
import { isHandled } from "./utils/handledEvents";
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../stores/history';
import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import { pinSize } from '../styles/designTokens';
import { isPinLabelKind, nextPinLabel } from '../tools/pinLabels';
import { getPinIconDefinition, resolvePinIcon, type PinIconId } from '../types/pinIcons';
import { canvasBadgeColors, isDarkTheme } from './utils/canvasBadgeColors';
import { dispatchPinAction } from './utils/pinActions';
import { pinOpenLook } from './pinOpenLook';
import { hexLayoutOfGrid, isShownAsHex, pinDisplayPoint } from '../grid/hexLinks';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { createReadableMark, createRollMark } from './pinBadgeMarks';
import { isEncounterFolderLink } from '../links/atlasLinkTargets';
import { readablePinEntry } from './pinReadableMenu';
import { openPinMenu, type PinnedSceneLevels } from './pinSceneLevelMenu';
import { t } from '../i18n';
import { levelObjects } from '../levels/levelObjects';

/** True when anything other than the position changed, which means the pin's graphics must be rebuilt. */
function differsBeyondPosition(pin: NotePin, prev: NotePin | undefined): boolean {
  if (!prev) return true;
  const keys = new Set([...Object.keys(pin), ...Object.keys(prev)]) as Set<keyof NotePin>;
  for (const key of keys) {
    if (key !== 'x' && key !== 'y' && pin[key] !== prev[key]) return true;
  }
  return false;
}

export class PinRenderer {
  private viewport: Viewport;
  private eventBus: EventEmitter;
  private pinContainer: Container;
  private pinSprites: Record<string, Container> = {};
  private _unsubscribeFromStore?: () => void;
  private _notePinToolViewportListener: ((e: FederatedPointerEvent) => void) | null = null;
  private _viewportPinClickListener: ((e: FederatedPointerEvent) => void) | null = null;
  private isPlayerView: boolean;
  private pinnedSceneLevels: PinnedSceneLevels | null = null;
  private store: ViewAtlasStore;
  private iconTextureCache: Map<PinIconId, Texture | null> = new Map();
  private themeObserver: MutationObserver | null = null;
  private _viewportZoomHandler?: () => void;
  private previewPin: Container | null = null;
  private previewIcon: string = 'pin';
  private _viewportPointerMoveHandler?: (e: FederatedPointerEvent) => void;
  private pinPreviewShowHandler: ((data: { icon: string }) => void) | null = null;
  private pinPreviewHideHandler: (() => void) | null = null;
  private pinPreviewUpdateHandler: ((data: { x: number; y: number; icon: string }) => void) | null = null;
  private pinPreviewUpdateIconHandler: ((data: { icon: string }) => void) | null = null;
  
  constructor(viewport: Viewport, eventBus: EventEmitter, store: ViewAtlasStore, isPlayerView: boolean = false) {
    this.viewport = viewport;
    this.eventBus = eventBus;
    this.store = store;
    this.isPlayerView = isPlayerView;
    
    this.pinContainer = new Container();
    this.pinContainer.label = 'pins';
    this.pinContainer.zIndex = MAP_LAYER_Z.pins;
    this.pinContainer.sortableChildren = true;
    this.pinContainer.eventMode = 'none'; // Viewport-level dispatch handles pin interactions
    this.pinContainer.interactiveChildren = false;
    this.viewport.addChild(this.pinContainer);
    const unsubscribePins = this.store.subscribe(
      (state: ViewAtlasState) => levelObjects(state).pins,
      this.syncPins.bind(this),
      { fireImmediately: true }
    );
    // Pins linked to a hex sit in its centre, which moves with the grid
    const unsubscribeHexGrid = this.store.subscribe(
      (state: ViewAtlasState) => state.grid,
      () => this.repositionPins(),
    );
    // The player window mirrors this canvas, so pins must vanish with the GM view
    const unsubscribeGMView = this.store.subscribe(
      (state: ViewAtlasState) => state.isGMView,
      () => { this.pinContainer.visible = !this.arePinsHidden(); },
      { fireImmediately: true }
    );
    this._unsubscribeFromStore = () => {
      unsubscribePins();
      unsubscribeHexGrid();
      unsubscribeGMView();
    };
    this._notePinToolViewportListener = (e: FederatedPointerEvent) => {
      // Skip if already handled by viewport-level dispatch (e.g. pin click)
      if (isHandled(e)) return;

      const activeTool = this.store.getState().activeTool;
      if (activeTool === 'fog' || activeTool === 'eraser') return;

      if (activeTool === 'note-pin' && e.button === 0) {
        const worldPos = this.viewport.toWorld(e.global);
        this.eventBus.emit('canvas-click', {
          x: e.global.x, y: e.global.y,
          worldX: worldPos.x, worldY: worldPos.y,
          shiftKey: e.shiftKey,
        });
      }
    };
    // Set viewport to be interactive
    this.viewport.interactive = true;
    this.viewport.on('pointerdown', this._notePinToolViewportListener, this);
    
    // Set up theme observer
    this.setupThemeObserver();
    
    // Set up viewport zoom listener
    this.setupViewportListeners();
    
    // Set up preview pin event listeners
    this.setupPreviewPinListeners();
  }
  
  /** The icon's white glyph texture, rasterised once per renderer; null where no 2D canvas exists. */
  private getIconTexture(icon: PinIconId): Texture | null {
    if (!this.iconTextureCache.has(icon)) this.iconTextureCache.set(icon, createPinIconTexture(icon));
    return this.iconTextureCache.get(icon) ?? null;
  }

  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme changed, redraw all pins
          this.redrawAllPins();
        }
      }
    });
    
    // Start observing
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  private setupViewportListeners(): void {
    // Update pins on viewport zoom for consistent size
    this._viewportZoomHandler = () => {
      this.updatePinScales();
    };
    
    this.viewport.on('zoomed', this._viewportZoomHandler);
    this.viewport.on('zoomed-end', this._viewportZoomHandler);
  }
  
  private setupPreviewPinListeners(): void {
    this.pinPreviewShowHandler = (data: { icon: string }) => {
      this.showPreviewPin(data.icon);
    };
    this.pinPreviewHideHandler = () => {
      this.hidePreviewPin();
    };
    this.pinPreviewUpdateHandler = (data: { x: number; y: number; icon: string }) => {
      this.updatePreviewPin(data.x, data.y, data.icon);
    };
    this.pinPreviewUpdateIconHandler = (data: { icon: string }) => {
      this.updatePreviewPinIcon(data.icon);
    };

    // Listen for pin preview events
    this.eventBus.on('pin-preview-show', this.pinPreviewShowHandler);
    this.eventBus.on('pin-preview-hide', this.pinPreviewHideHandler);
    this.eventBus.on('pin-preview-update', this.pinPreviewUpdateHandler);
    this.eventBus.on('pin-preview-update-icon', this.pinPreviewUpdateIconHandler);
    
    // Set up viewport pointer move handler for preview position updates
    // Emitted even while the preview pin is hidden: Shift turns the tool into hex linking
    this._viewportPointerMoveHandler = (e: FederatedPointerEvent) => {
      if (this.store.getState().activeTool === 'note-pin') {
        const worldPos = this.viewport.toWorld(e.global);
        this.eventBus.emit('viewport-pointer-move', {
          worldX: worldPos.x,
          worldY: worldPos.y,
          shiftKey: e.shiftKey,
        });
      }
    };
    
    this.viewport.on('pointermove', this._viewportPointerMoveHandler);
  }
  
  private updatePinScales(): void {
    const scale = this.getPinScale();
    
    for (const pinId in this.pinSprites) {
      const pinGroup = this.pinSprites[pinId];
      if (pinGroup) {
        pinGroup.scale.set(scale);
      }
    }
    
    if (this.previewPin) {
      this.previewPin.scale.set(scale);
    }
  }

  private getPinScale(): number {
    return mapMarkerScale(this.viewport.scale.x);
  }
  
  private pinPosition(pin: NotePin): { x: number; y: number } {
    return pinDisplayPoint(pin, hexLayoutOfGrid(this.store.getState().grid));
  }

  private repositionPins(): void {
    for (const pin of Object.values(levelObjects(this.store.getState()).pins)) {
      const position = this.pinPosition(pin);
      this.pinSprites[pin.id]?.position.set(position.x, position.y);
    }
  }

  private redrawAllPins(): void {
    const pins = levelObjects(this.store.getState()).pins;
    for (const pinId in pins) {
      const pin = pins[pinId];
      const pinGroup = this.pinSprites[pinId];
      if (pin && pinGroup) {
        // Force redraw by removing and recreating the pin graphics
        this.clearPinGraphics(pinGroup);
        
        const iconType = pin.icon || 'pin';
        const iconContainer = this.createPinGraphics(iconType, pin);
        pinGroup.addChild(iconContainer);
      }
    }
  }

  public getPinContainer(): Container {
    return this.pinContainer;
  }

  /** Pins are DM-only: hidden in player views and whenever the DM previews the player perspective. */
  private arePinsHidden(): boolean {
    return this.isPlayerView || !this.store.getState().isGMView;
  }

  /** Geometry-based hit test: returns the pinId at (worldX, worldY), or null. */
  public hitTestPins(worldX: number, worldY: number): string | null {
    if (this.arePinsHidden()) return null;

    const pins = levelObjects(this.store.getState()).pins;
    const layout = hexLayoutOfGrid(this.store.getState().grid);
    const hitRadius = 20 * this.getPinScale();

    for (const [id, pin] of Object.entries(pins)) {
      // A linked pin is part of its hex, which handles the pointer
      if (!pin || isShownAsHex(pin, layout)) continue;
      const dx = worldX - pin.x;
      const dy = worldY - pin.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return id;
      }
    }
    return null;
  }

  /** Handles a viewport-routed click on a pin (drag or context menu). */
  public handleViewportPinPointerDown(pinId: string, e: FederatedPointerEvent): void {
    const pin = levelObjects(this.store.getState()).pins[pinId];
    if (!pin) return;

    if (e.button === 2) {
      this.showPinContextMenu(pin, { x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button === 0) {
      // Left-click: start drag (same logic as inline handler)
      let isDragging = false;
      let hasMoved = false;
      const dragThreshold = 5;
      const startPos = { x: e.global.x, y: e.global.y };
      const worldStartPos = this.viewport.toWorld(e.global);
      const initialPinPos = { x: pin.x, y: pin.y };

      const onPointerMove = (moveEvent: FederatedPointerEvent): void => {
        const dx = moveEvent.global.x - startPos.x;
        const dy = moveEvent.global.y - startPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!isDragging && distance > dragThreshold) {
          isDragging = true;
          hasMoved = true;
          this.viewport.plugins.pause('drag');
          this.store.getState().setPersistenceEnabled(false);
          // Live pin updates below collapse into one undo step
          beginHistoryTransaction(this.store);
        }

        if (isDragging) {
          const worldPos = this.viewport.toWorld(moveEvent.global);
          const worldDx = worldPos.x - worldStartPos.x;
          const worldDy = worldPos.y - worldStartPos.y;
          this.store.getState().updateNotePin(pinId, {
            x: initialPinPos.x + worldDx,
            y: initialPinPos.y + worldDy,
          });
        }
      };

      const onPointerUp = (): void => {
        this.viewport.off('pointermove', onPointerMove);
        this.viewport.off('pointerup', onPointerUp);
        this.viewport.off('pointerupoutside', onPointerUp);

        if (isDragging) {
          this.store.getState().setPersistenceEnabled(true);
          const currentPin = levelObjects(this.store.getState()).pins[pinId];
          if (currentPin) {
            this.store.getState().updateNotePin(pinId, { x: currentPin.x, y: currentPin.y });
          }
          endHistoryTransaction(this.store);
          this.viewport.plugins.resume('drag');
        } else if (!hasMoved) {
          dispatchPinAction('open', pin, this.store);
        }
      };

      this.viewport.on('pointermove', onPointerMove);
      this.viewport.on('pointerup', onPointerUp);
      this.viewport.on('pointerupoutside', onPointerUp);
    }
  }
  
  /** Removes and destroys a pin's graphics; cached icon textures survive (no `texture` flag). */
  private clearPinGraphics(pinGroup: Container): void {
    for (const child of pinGroup.removeChildren()) {
      destroyTree(child);
    }
  }

  /** Graphics for the placement preview, labelled with what the next placed pin would get. */
  private createPreviewGraphics(icon: string): Container {
    const previewPin: NotePin = { id: 'preview', kind: 'pin', x: 0, y: 0, icon, notePath: '' };
    if (isPinLabelKind(icon)) {
      previewPin.label = nextPinLabel(levelObjects(this.store.getState()).pins, icon);
    }
    return this.createPinGraphics(icon, previewPin);
  }

  private createPinGraphics(iconType: string, pin: NotePin): Container {
    const container = new Container();
    
    // Get theme colors
    const colors = canvasBadgeColors();
    const isDarkMode = isDarkTheme();
    
    // Create the circular badge background using design tokens
    const bgGraphics = new Graphics();
    const badgeRadius = pinSize.badgeRadius;
    
    // Draw circular background
    bgGraphics.circle(0, 0, badgeRadius);
    bgGraphics.fill({ color: colors.background, alpha: 0.95 });
    
    // Add subtle border
    bgGraphics.circle(0, 0, badgeRadius);
    bgGraphics.stroke({ width: 0.5, color: colors.stroke, alpha: isDarkMode ? 0.4 : 0.3 });
    container.addChild(bgGraphics);
    
    const icon = resolvePinIcon(iconType);
    if (isPinLabelKind(icon)) {
      const labelText = new Text({
        text: pin.label ?? '',
        style: new TextStyle({
          fill: colors.stroke,
          fontSize: badgeRadius,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        }),
        resolution: 8,
      });
      labelText.anchor.set(0.5);
      // Longer labels ("12", "AB") shrink to stay inside the badge
      labelText.scale.set(Math.min(1, (badgeRadius * 1.5) / labelText.width));
      container.addChild(labelText);
    } else {
      const iconTexture = this.getIconTexture(icon);
      if (iconTexture) {
        const iconSprite = new Sprite(iconTexture);
        iconSprite.anchor.set(0.5);
        iconSprite.setSize(pinSize.iconSize);
        iconSprite.tint = getPinIconDefinition(icon).tone[isDarkMode ? 'dark' : 'light'];
        container.addChild(iconSprite);
      }
    }
    if (isEncounterFolderLink(pin.notePath)) container.addChild(createRollMark(badgeRadius, colors));
    else if (pin.readable === true) container.addChild(createReadableMark(badgeRadius, colors));

    return container;
  }
  

  /** Reads the levels of the scene a pin links, for its menu's level choice; set by the view. */
  public setPinnedSceneLevels(read: PinnedSceneLevels): void {
    this.pinnedSceneLevels = read;
  }

  private showPinContextMenu(pin: NotePin, pos: { x: number; y: number }): void {
    const entries: ContextMenuEntry[] = [
      { type: 'item', ...pinOpenLook(pin), onClick: () => dispatchPinAction('open', pin, this.store) },
      { type: 'item', label: t('pinMenu.edit'), icon: 'edit', onClick: () => dispatchPinAction('edit', pin, this.store) },
      ...[readablePinEntry(this.store, pin)].filter((entry) => entry !== null),
      { type: 'item', label: t('common.duplicate'), icon: 'files', onClick: () => this.store.getState().duplicateMapObjects([pin.id]) },
      { type: 'item', label: t('common.delete'), icon: 'trash', destructive: true, onClick: () => this.store.getState().deleteMapObject('pin', pin.id) },
    ];
    openPinMenu(this.store, pin, entries, pos, this.pinnedSceneLevels);
  }

  private syncPins = (
    pinsRecord: Record<string, NotePin>,
    prevPinsRecord: Record<string, NotePin> | undefined
  ) => {
    if (!this.pinContainer) {
        console.error('[PinRenderer] syncPins called but pinContainer is null!');
        return;
    }
    
    // Hide all pins in player view
    if (this.isPlayerView) {
      this.pinContainer.visible = false;
      return;
    }
    
    const container = this.pinContainer;
    const prevIds = new Set(Object.keys(prevPinsRecord || {}));
    const newIds = new Set(Object.keys(pinsRecord));

    for (const id of prevIds) {
      if (!newIds.has(id)) {
        const pinGroup = this.pinSprites[id];
        if (pinGroup) {
          destroyTree(pinGroup);
          delete this.pinSprites[id];
        }
      }
    }

    for (const id of newIds) {
      const pin = pinsRecord[id];
      if (!pin) continue;
      
      let pinGroup = this.pinSprites[id];
      if (pinGroup) {
        const prevPin = prevPinsRecord?.[id];
        if (pin === prevPin) continue;
        const position = this.pinPosition(pin);
        pinGroup.position.set(position.x, position.y);
        pinGroup.visible = true;
        // Dragging only moves the pin; its graphics are rebuilt when what they show changes
        if (!differsBeyondPosition(pin, prevPin)) continue;

        this.clearPinGraphics(pinGroup);
        pinGroup.addChild(this.createPinGraphics(pin.icon || 'pin', pin));
        pinGroup.scale.set(this.getPinScale());
        continue;
      }

      pinGroup = new Container();
      pinGroup.label = `pin-${id}`;
      const position = this.pinPosition(pin);
      pinGroup.position.set(position.x, position.y);
      pinGroup.visible = true; 
      
      // Create pin graphics
      const iconType = pin.icon || 'pin';
      const iconContainer = this.createPinGraphics(iconType, pin);
      
      pinGroup.addChild(iconContainer);
      
      pinGroup.interactive = false;
      pinGroup.eventMode = 'none'; // Viewport-level dispatch handles pin interactions
      pinGroup.hitArea = new Circle(0, 0, 20); // Kept for reference; actual hit-test is geometry-based
      
      pinGroup.scale.set(this.getPinScale());

      // Pin interactions are handled via viewport-level dispatch (handleViewportPinPointerDown)

      container.addChild(pinGroup);
      this.pinSprites[id] = pinGroup;
    }
  };

  private showPreviewPin(icon: string): void {
    if (this.previewPin) {
      this.hidePreviewPin();
    }
    
    this.previewIcon = icon;
    this.previewPin = new Container();
    this.previewPin.label = 'preview-pin';
    this.previewPin.alpha = 0.7; // Make it slightly transparent to indicate it's a preview
    
    this.previewPin.addChild(this.createPreviewGraphics(icon));
    
    this.previewPin.scale.set(this.getPinScale());
    
    // Position at cursor (will be updated by mouse move)
    this.previewPin.position.set(0, 0);
    
    // Add to pin container
    this.pinContainer.addChild(this.previewPin);
  }
  
  private hidePreviewPin(): void {
    if (this.previewPin) {
      destroyTree(this.previewPin);
      this.previewPin = null;
    }
  }
  
  private updatePreviewPin(x: number, y: number, icon: string): void {
    if (!this.previewPin) {
      this.showPreviewPin(icon);
    }
    
    if (this.previewPin) {
      this.previewPin.position.set(x, y);
      
      // Update icon if it changed
      if (icon !== this.previewIcon) {
        this.updatePreviewPinIcon(icon);
      }
    }
  }
  
  private updatePreviewPinIcon(icon: string): void {
    if (!this.previewPin) return;
    
    this.previewIcon = icon;
    
    this.clearPinGraphics(this.previewPin);
    this.previewPin.addChild(this.createPreviewGraphics(icon));
  }

  public destroy(): void {
    this._unsubscribeFromStore?.();
    if (this._notePinToolViewportListener && this.viewport) {
        this.viewport.off('pointerdown', this._notePinToolViewportListener);
        this._notePinToolViewportListener = null;
    }
    if (this._viewportPinClickListener && this.viewport) {
        this.viewport.off('pointerdown', this._viewportPinClickListener);
        this._viewportPinClickListener = null;
    }
    
    // Clean up theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    
    // Clean up viewport listeners
    if (this._viewportZoomHandler && this.viewport) {
      this.viewport.off('zoomed', this._viewportZoomHandler);
      this.viewport.off('zoomed-end', this._viewportZoomHandler);
      delete this._viewportZoomHandler;
    }
    
    // Clean up pointer move handler
    if (this._viewportPointerMoveHandler && this.viewport) {
      this.viewport.off('pointermove', this._viewportPointerMoveHandler);
      delete this._viewportPointerMoveHandler;
    }
    
    // Clean up preview pin
    this.hidePreviewPin();
    
    // Clean up preview pin event listeners
    if (this.pinPreviewShowHandler) {
      this.eventBus.off('pin-preview-show', this.pinPreviewShowHandler);
      this.pinPreviewShowHandler = null;
    }
    if (this.pinPreviewHideHandler) {
      this.eventBus.off('pin-preview-hide', this.pinPreviewHideHandler);
      this.pinPreviewHideHandler = null;
    }
    if (this.pinPreviewUpdateHandler) {
      this.eventBus.off('pin-preview-update', this.pinPreviewUpdateHandler);
      this.pinPreviewUpdateHandler = null;
    }
    if (this.pinPreviewUpdateIconHandler) {
      this.eventBus.off('pin-preview-update-icon', this.pinPreviewUpdateIconHandler);
      this.pinPreviewUpdateIconHandler = null;
    }
    
    // Destroy cached textures
    for (const texture of this.iconTextureCache.values()) {
      if (texture && !texture.destroyed) {
        texture.destroy(true);
      }
    }
    this.iconTextureCache.clear();
    
    if (this.pinContainer) {
        destroyTree(this.pinContainer, { textures: true });
    }
    this.pinSprites = {};
  }
} 
