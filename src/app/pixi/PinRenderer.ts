import { Container, FederatedPointerEvent, Circle, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { EventEmitter } from 'events';
import type { NotePin } from "../types";
import { createPinIconTexture } from "./utils/pinIconTexture";
import { drawPinFace, type DrawnPin } from './pinFace';
import { PinNameLayer, type NamedPin } from './pinNameLayer';
import { PlayerPins, type PlayerPointSight } from './playerPins';
import type { LayerVisibility } from './playerSafeFrame';
import type { PinNameLabel } from './pinNameLabel';
import { pinGroupScale, pinScreenDiameter, type MapSize } from './pinSizing';
import { pinSize } from '../styles/designTokens';
import type { PinIconId } from '../types/pinIcons';
import { destroyTree } from "./utils/destroyTree";
import { isHandled } from "./utils/handledEvents";
import { isPrimaryPress, isSecondaryPress } from "./utils/pointerButtons";
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../stores/history';
import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import { isPinLabelKind, nextPinLabel } from '../tools/pinLabels';
import { dispatchPinAction } from './utils/pinActions';
import { pinOpenLook } from './pinOpenLook';
import { hexLayoutOfGrid, isShownAsHex, pinDisplayPoint } from '../grid/hexLinks';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { readablePinEntry } from './pinReadableMenu';
import { pinNameEntries } from './pinNameMenu';
import { openPinMenu, type PinnedSceneLevels } from './pinSceneLevelMenu';
import { t } from '../i18n';
import { levelObjects } from '../levels/levelObjects';
import { pinNameBoxes } from './pinNameLayout';

/** True when anything other than the position changed, which means the pin's graphics must be rebuilt. */
function differsBeyondPosition(pin: NotePin, prev: NotePin | undefined): boolean {
  if (!prev) return true;
  const keys = new Set([...Object.keys(pin), ...Object.keys(prev)]) as Set<keyof NotePin>;
  for (const key of keys) {
    if (key !== 'x' && key !== 'y' && pin[key] !== prev[key]) return true;
  }
  return false;
}

/** The least radius on screen a pin answers the pointer within, also as a dot. */
const MIN_HIT_RADIUS = 10;

/** The pins that carry a name, with the groups their names are placed by. */
function namedPins(faces: ReadonlyMap<string, DrawnPin>, groups: Readonly<Record<string, Container>>): Map<string, NamedPin> {
  const named = new Map<string, NamedPin>();
  for (const [id, face] of faces) {
    const group = groups[id];
    if (face.name && group) named.set(id, { group, name: face.name });
  }
  return named;
}

/** The names of the pins that show their glyph: a dot carries none. */
function shownNames(faces: ReadonlyMap<string, DrawnPin>): Map<string, PinNameLabel> {
  const names = new Map<string, PinNameLabel>();
  for (const [id, face] of faces) {
    if (!face.name) continue;
    if (face.whole()) names.set(id, face.name);
    else face.name.view.visible = false;
  }
  return names;
}

export class PinRenderer {
  private viewport: Viewport;
  private eventBus: EventEmitter;
  private pinContainer: Container;
  private pinSprites: Record<string, Container> = {};
  /** The pins as drawn, by pin id: they turn into dots and back, and their names are laid out again, as the map zooms. */
  private pinFaces = new Map<string, DrawnPin>();
  /** The placement preview as drawn, sized like the pins. */
  private previewFace: DrawnPin | null = null;
  /** The names of these pins, above the fog. */
  private readonly nameLayer = new PinNameLayer('pin-names');
  /** The pins the players' picture shows in place of these: in the players' frame and in session view. */
  private readonly players: PlayerPins;
  /** A refresh of the players' pins waits for the next frame, so the sight a store change moves has been worked out. */
  private playersFrame: number | null = null;
  /** The map's size in world pixels: pins are a share of it (`pinGroupScale`), and names show only once it carries them. */
  private mapSize: () => MapSize | null = () => null;
  /** The map's size changed (a map loaded, a stretch applied): the pins it carries are sized again. */
  private readonly mapImageUpdated = (): void => this.updatePinScales();
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
    this.players = new PlayerPins({
      pins: () => levelObjects(this.store.getState()).pins,
      place: (pin) => this.pinPosition(pin),
      draw: (pin) => drawPinFace(pin, (icon) => this.getIconTexture(icon), { marks: false, named: true }),
      scale: () => this.getPinScale(),
      zoom: () => this.viewport.scale.x,
      mapSize: () => this.mapSize(),
    });
    this.viewport.addChild(this.players.view, this.players.names.view, this.nameLayer.view);
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
      () => {
        this.pinContainer.visible = !this.arePinsHidden();
        this.nameLayer.view.visible = this.pinContainer.visible;
        // Session view shows the players' pins on this canvas, as their frame does
        this.players.setShown(!this.isPlayerView && !this.store.getState().isGMView);
        if (this.players.view.visible) this.players.refresh();
      },
      { fireImmediately: true }
    );
    // While the canvas shows the players' view, what they see follows every change of the scene
    const unsubscribeScene = this.store.subscribe(() => {
      if (this.players.view.visible) this.schedulePlayersRefresh();
    });
    this._unsubscribeFromStore = () => {
      unsubscribePins();
      unsubscribeHexGrid();
      unsubscribeGMView();
      unsubscribeScene();
    };
    this._notePinToolViewportListener = (e: FederatedPointerEvent) => {
      // Skip if already handled by viewport-level dispatch (e.g. pin click)
      if (isHandled(e)) return;

      const activeTool = this.store.getState().activeTool;
      if (activeTool === 'fog' || activeTool === 'eraser') return;

      if (activeTool === 'note-pin' && isPrimaryPress(e)) {
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
    this.eventBus.on('map-image-updated', this.mapImageUpdated);
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
  
  /** Sizes every pin for the zoom: its scale, dot or glyph, and the names that fit. */
  private updatePinScales(): void {
    const scale = this.getPinScale();
    const diameter = pinScreenDiameter(this.viewport.scale.x, this.mapSize());
    for (const pinId in this.pinSprites) {
      this.pinSprites[pinId]?.scale.set(scale);
    }
    for (const face of this.pinFaces.values()) face.fitTo(diameter);
    if (this.previewPin) {
      this.previewPin.scale.set(scale);
      this.previewFace?.fitTo(diameter);
    }
    this.layoutNames();
    this.players.rescale();
  }

  /** Draws every name for the zoom, then hides those under a dot, too wide for the map or covering another name or pin. */
  private layoutNames(): void {
    this.nameLayer.sync(namedPins(this.pinFaces, this.pinSprites));
    const names = shownNames(this.pinFaces);
    if (names.size === 0) return;
    const scale = this.getPinScale();
    const zoom = this.viewport.scale.x;
    for (const label of names.values()) label.draw(scale, zoom);
    const shown = pinNameBoxes(names, this.pinSprites, scale, this.mapSize()?.width ?? null);
    for (const [id, face] of this.pinFaces) {
      if (face.name) face.name.view.visible = shown.has(id);
    }
  }

  /** The pins' world scale: a share of the map, between a findable and their full size on screen. */
  private getPinScale(): number {
    return pinGroupScale(this.viewport.scale.x, this.mapSize());
  }
  
  private pinPosition(pin: NotePin): { x: number; y: number } {
    return pinDisplayPoint(pin, hexLayoutOfGrid(this.store.getState().grid));
  }

  private repositionPins(): void {
    for (const pin of Object.values(levelObjects(this.store.getState()).pins)) {
      const position = this.pinPosition(pin);
      this.pinSprites[pin.id]?.position.set(position.x, position.y);
    }
    this.layoutNames();
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
    this.layoutNames();
    this.players.clear();
    if (this.players.view.visible) this.players.refresh();
  }

  public getPinContainer(): Container {
    return this.pinContainer;
  }

  /** How large the map is in world pixels, which pins and names are sized by; set by the view. */
  public setMapSize(read: () => MapSize | null): void {
    this.mapSize = read;
    this.updatePinScales();
  }

  /** How the players' sight is read for the pins they are shown; set by the view once its fog and lighting exist. */
  public setPlayerSight(sight: PlayerPointSight): void {
    this.players.setSight(sight);
  }

  /** The players' frame: the GM's pins hidden, the pins players see now shown in their place. */
  public playerLayers(): LayerVisibility[] {
    this.players.refresh();
    return [
      { layer: this.pinContainer, visible: false },
      { layer: this.nameLayer.view, visible: false },
      { layer: this.players.view, visible: true },
      { layer: this.players.names.view, visible: true },
    ];
  }

  /** A picture of the scene (a thumbnail): no pin at all. */
  public pictureLayers(): LayerVisibility[] {
    return [
      { layer: this.pinContainer, visible: false },
      { layer: this.nameLayer.view, visible: false },
      { layer: this.players.view, visible: false },
      { layer: this.players.names.view, visible: false },
    ];
  }

  private schedulePlayersRefresh(): void {
    if (this.playersFrame !== null) return;
    this.playersFrame = window.requestAnimationFrame(() => {
      this.playersFrame = null;
      if (this.players.view.visible) this.players.refresh();
    });
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
    // A pin shrunk to a dot keeps a hit area a pointer can find
    const zoom = this.viewport.scale.x > 0 ? this.viewport.scale.x : 1;
    const hitRadius = Math.max(pinSize.badgeRadius * this.getPinScale(), MIN_HIT_RADIUS / zoom);

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

    if (isSecondaryPress(e)) {
      this.showPinContextMenu(pin, { x: e.clientX, y: e.clientY });
      return;
    }

    if (isPrimaryPress(e)) {
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
    return this.createPinGraphics(icon, previewPin, false);
  }

  /** The badge, its glyph or label and its marks, and its name under it where it shows one (`named`), fitted to the zoom. */
  private createPinGraphics(iconType: string, pin: NotePin, named = true): Container {
    const face = drawPinFace({ ...pin, icon: iconType }, (icon) => this.getIconTexture(icon), { marks: true, named });
    face.fitTo(pinScreenDiameter(this.viewport.scale.x, this.mapSize()));
    if (named) this.pinFaces.set(pin.id, face);
    else this.previewFace = face;
    return face.view;
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
      ...pinNameEntries(this.store, pin),
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
        this.pinFaces.delete(id);
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
    this.layoutNames();
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
    this.previewFace = null;
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
    
    this.eventBus.off('map-image-updated', this.mapImageUpdated);

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
    this.pinFaces.clear();
    this.previewFace = null;
    if (this.playersFrame !== null) window.cancelAnimationFrame(this.playersFrame);
    this.players.destroy();
    this.nameLayer.destroy();
  }
} 
