import type { FogCoverage } from '../fog/fogCoverage';
import type { SelectionAction } from '../selection/selectionActions';
import { StatblockTokenSync } from '../plugin/StatblockTokenSync';
import { TokenCollectionSync } from '../plugin/TokenCollectionSync';
import type { ResourceDefsProvider } from '../resources/resourceTypes';
import { fitTokenArtwork, syncTokenArtwork } from './token-renderer/tokenArtwork';
import { SettingsService, type AtlasSettings } from '../services/SettingsService';
import { HIDDEN_TOKEN_ALPHA, gmTokenLayers, type HideableLayer, type LayerVisibility } from './playerSafeFrame';
import type { TokenPerception } from '../vision/tokenPerception';
import { TokenExit } from './token-renderer/TokenExit';
import { TokenPile } from './token-renderer/TokenPile';
import { NOTHING_SEEN, PlayerSightTokens, seenByPlayers, seenTokens } from './token-renderer/PlayerSightTokens';
import type { CanvasAudience } from './audience/CanvasAudience';
import { TurnMarkers } from './token-renderer/turnMarker/TurnMarkers';
import { ShownBadgeNumbers, type PlayerBadgeNumbers } from './token-renderer/PlayerBadgeNumbers';
import type { TokenSeen } from '../vision/measureOrigin';
import { Sprite, Container, Graphics, Application, Ticker } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { App as ObsidianApp } from 'obsidian';
import type { TokenEntity } from "../types";
import type { GroupTurnHost } from "./selection/GroupRotation";
import { gridPivot } from "./selection/groupTurn";
import { isHexGridType } from "../grid/hexGeometry";
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import type { GridSystem } from "../grid/GridSystem";
import type { ViewAtlasStore } from '../storeFactory';
import { EventEmitter } from '../utils/typedEmitter';
import { AssetValidationService } from '../services/AssetValidationService';
import { TokenStatblockLinkService } from '../services/TokenStatblockLinkService';
import { SpriteFactory } from './token-renderer/SpriteFactory';
import { computeTokenPixelSize } from './token-renderer/tokenSizing';
import { TextureCache } from './token-renderer/TextureCache';
import { ArtUploads } from './token-renderer/artUploads';
import { UIManager } from './token-renderer/UIManager';
import { InteractionController } from './token-renderer/InteractionController';
import { tokenPointer } from './token-renderer/tokenPointer';
import type { TokenPointer } from './pointer/mapLayers';
import { DragRuler, type DragRulerPath } from './token-renderer/DragRuler';
import { tokenMovement, type TokenMovement } from './token-renderer/tokenMovement';
import { DragRulerView } from './token-renderer/DragRulerView';
import { DEFAULT_DRAG_DISTANCE, showsDragDistance } from '../measure/dragDistance';
import { SyncService } from './token-renderer/SyncService';
import { tokenSyncState } from './token-renderer/tokenSyncState';
import { TokenPlaces, type HeldPlayout, type TokenHolder } from './token-renderer/TokenPlaces';
import { TokenBump } from './token-renderer/TokenBump';
import type { ShownPlaces } from '../lighting/shownPlaces';
import type { Point } from '../types/visionTypes';
import type { ArtFloors } from '../levels/levelSurfaces';
import { PLAYER_SIGHT_POLICY } from '../vision/tokenSightPolicy';
import { createSceneSource } from '../plugin/host/sceneSource';
import { updateInstanceBadge } from './token-renderer/InstanceBadge';
import { HiddenTokenIcon } from './token-renderer/HiddenTokenIcon';
import { TokenOverlays } from './token-renderer/TokenOverlays';
import { tokenOverlays } from '../api/extensionPoints';
import { watchSquareCorners } from './utils/squareCorners';
import { viewportDocument } from './utils/viewportDocument';
import { DownedTokenOverlay } from './token-renderer/DownedTokenOverlay';
import { isTokenDowned } from './token-renderer/isTokenDowned';
import { rendersHeld, requestRender } from './RenderScheduler';
import { normalizeImagePath } from '../utils/pathUtils';
import { prefersReducedMotion } from '../utils/motion';
import { destroyTree } from './utils/destroyTree';
import type { BarsSpan, TokenGroupContainer } from './token-renderer/types';
import type { TokenPreview } from './tokenPlacement/PlacementGhost';
import type { TokenInput } from '../types/viewState';
import { watchDarkTheme } from './utils/canvasBadgeColors';
import { runInBackground } from '../utils/backgroundTask';
import { everyLevelObjects, levelObjects } from '../levels/levelObjects';
import { mapTokens, sceneTokens } from '../tokens/offMap';

export class TokenRenderer {
  private obsApp: ObsidianApp;
  private viewport: Viewport;
  private gridSystem: GridSystem;
  private tokenContainer: Container;
  private tokenSprites: Record<string, TokenGroupContainer | null> = {};
  /** The ways the tokens of a group being turned face until it is put down (`showFacings`). */
  private groupFacings: ReadonlyMap<string, number> | null = null;
  private tokenRings: Record<string, Graphics | Sprite> = {};
  private _unsubscribeFromStore?: () => void;
  private _unsubscribeFromViewport?: () => void;
  private selectionOverlayUpdater: () => void;
  private store: ViewAtlasStore;
  private eventBus: EventEmitter;
  private collectionSync: TokenCollectionSync;
  /** The resources of the map's collection; set once the asset service is wired. */
  private resourceDefsProvider: ResourceDefsProvider = () => [];
  private assetValidationService?: AssetValidationService;
  private statblockSync: StatblockTokenSync;
  private spriteFactory: SpriteFactory;
  private textureCache: TextureCache;
  /** The art of the scene shown before this one, kept decoded so that switching back shows its tokens without decoding them again. */
  private previousSceneArt: string[] = [];
  private readonly hiddenTokenIcon = new HiddenTokenIcon();
  private readonly overlays = new TokenOverlays(() => this.redrawOverlays());
  private readonly stopFollowingOverlays = tokenOverlays.subscribe(() => this.redrawOverlays());
  /** Square corners (Appearance settings) switched: the bars and badges every token draws take the new corners. */
  private readonly stopWatchingCorners: () => void;
  private readonly downedTokenOverlay = new DownedTokenOverlay(
    () => {
      if (this.pixiApp) requestRender(this.pixiApp);
    },
    () => this.pixiApp?.ticker ?? null,
  );
  /** Where each token is drawn: its sprite, its UI and where sight reads it move together. */
  private readonly places: TokenPlaces;
  /** Tokens players walked into a wall with: their drawings lean and spring back. */
  private readonly bumps: TokenBump;
  private readonly exit = new TokenExit({
    getTicker: () => this.pixiApp?.ticker ?? null,
    reducedMotion: () => prefersReducedMotion(this.viewport.options?.events?.domElement ?? activeDocument.body),
    requestRender: () => {
      if (this.pixiApp) requestRender(this.pixiApp);
    },
  });
  /** Whether a token may be drawn on its way between two places; set by the lighting while it lights the view. */
  private glideWay?: (from: Point, to: Point) => boolean;
  /** How tokens someone else holds are drawn (`setHeldPlayout`); null glides them to each place. */
  private heldPlayout: HeldPlayout | null = null;
  private uiManager: UIManager;
  private interactionController: InteractionController;
  /** The tokens as the map's pointer asks them (`MapPointer`). */
  public readonly pointer: TokenPointer;
  private dragRuler: DragRuler;
  private readonly movement: TokenMovement;
  private syncService: SyncService;
  
  
  /** Where each token lies; its art and its UI take that place whenever their art arrives. */
  private readonly pile = new TokenPile();
  // Batch sorting optimization
  private sortPending: boolean = false;
  private sortTimeout: number | null = null;
  
  // Store reference to PIXI app for renderer access
  private pixiApp: Application | null = null;
  private readonly artUploads = new ArtUploads({
    ticker: Ticker.shared,
    renderer: () => this.pixiApp?.renderer ?? null,
    held: () => this.pixiApp !== null && rendersHeld(this.pixiApp),
    othersLoading: (waiting) => this.tokensLoading.size > waiting,
  });
  
  // Track loading tokens
  private tokensLoading: Set<string> = new Set();
  /** Bumped on every map load; sprites that finish loading for an earlier one are discarded. */
  private mapLoadGeneration = 0;
  private allTokensLoadedCallbacks: Array<() => void> = [];
  private viewId: string;
  private stopThemeWatch: (() => void) | null = null;
  private isDestroyed = false;

  // Store event handlers for proper cleanup
  private _handleGridTypeChange?: EventListener;
  private _handleRotationUpdate?: (event: CustomEvent<TokenGestureEventDetail>) => void;
  private _handleResizeUpdate?: (event: CustomEvent<TokenGestureEventDetail>) => void;
  private _handleRotationEnded?: EventListener;
  private _handleResizeEnded?: EventListener;

  /** The tokens as the players' sight shows them: which are left out, and the outlines of sensed ones. */
  private readonly playerSight = new PlayerSightTokens({
    tokens: () => mapTokens(levelObjects(this.store.getState())),
    sprites: () => this.tokenSprites,
    held: () => this.heldTokenIds,
    showsPlayers: () => this.audience.showsPlayers(),
  });
  /** Whom the canvas is drawn for: the tokens show what it sees and tell it what the players see. */
  private readonly audience: CanvasAudience;
  private readonly stopDrawingForAudience: () => void;
  private readonly playerBadges = new ShownBadgeNumbers(() => this.store.getState());
  /** The marker on the tokens whose turn it is. */
  private turnMarkers!: TurnMarkers;
  /** Tokens held by the pointer; lighting alone does not hide them until release. */
  private heldTokenIds: ReadonlySet<string> = new Set();
  constructor(
    obsApp: ObsidianApp,
    viewport: Viewport,
    gridSystem: GridSystem,
    selectionOverlayUpdater: () => void,
    store: ViewAtlasStore,
    eventBus: EventEmitter,
    audience: CanvasAudience,
    viewId?: string,
    shownPlaces?: ShownPlaces,
    textureCache?: TextureCache,
  ) {
    this.bumps = new TokenBump({
      getTicker: () => this.pixiApp?.ticker ?? null,
      getSprite: (tokenId) => this.tokenSprites[tokenId] ?? null,
      cell: () => this.store.getState().grid?.size ?? 70,
      reducedMotion: () => prefersReducedMotion(this.viewport.options?.events?.domElement ?? activeDocument.body),
    });
    this.obsApp = obsApp;
    this.viewport = viewport;
    this.stopWatchingCorners = watchSquareCorners(viewportDocument(viewport).body, () => {
      this.uiManager.refreshResources();
      if (this.pixiApp) requestRender(this.pixiApp);
    });
    this.gridSystem = gridSystem;
    this.selectionOverlayUpdater = selectionOverlayUpdater;
    this.store = store;
    this.eventBus = eventBus;
    this.audience = audience;
    this.viewId = viewId || `tokenrenderer-${Date.now()}-${Math.random()}`;
    const tokenStatblockLinkService = TokenStatblockLinkService.getInstance(obsApp);

    // Check if this is a player view to disable interactions
    const isPlayerView = this.store.getState().isPlayerView || false;

    // Initialize sprite factory
    this.spriteFactory = new SpriteFactory(this.gridSystem, isPlayerView);
    this.spriteFactory.setTokenRingTextureReadyCallback(() => {
      // Rebuild rings once the textured asset is available.
      this.updateAllTokenSizes();
    });
    void this.spriteFactory.preloadTokenRingTexture();

    // The view's token art, which the levels below it show too
    this.textureCache = textureCache ?? new TextureCache(this.obsApp);

    // Initialize UI manager
    this.uiManager = new UIManager(this.viewport, this.store, this.viewId, isPlayerView);
    
    // Provide token sprite access to UI manager
    this.uiManager.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    this.uiManager.onSelectionUIChange = () => this.selectionOverlayUpdater();

    this.places = new TokenPlaces({
      getTicker: () => this.pixiApp?.ticker ?? null,
      getSprite: (tokenId) => this.tokenSprites[tokenId] ?? null,
      ui: this.uiManager,
      onMove: (tokenId) => this.followToken(tokenId),
      reducedMotion: () => prefersReducedMotion(this.viewport.options?.events?.domElement ?? activeDocument.body),
      ...(shownPlaces && { shown: shownPlaces }),
      clearWay: (from, to) => this.glideWay?.(from, to) ?? true,
      heldPlayout: () => this.heldPlayout,
      heldBy: (tokenId) => this.heldBy(tokenId),
    });
    
    // Initialize interaction controller
    this.interactionController = new InteractionController(
      this.viewport, 
      this.store, 
      this.gridSystem, 
      this.eventBus,
      this.obsApp,
      isPlayerView
    );
    
    // Set up interaction controller callbacks
    this.interactionController.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    this.interactionController.setTokenPlaces(this.places);
    this.interactionController.setHandlePositionUpdater(() => 
      this.uiManager.updateHandlePositions()
    );
    this.interactionController.setTokensHeldCallback((tokenIds) => {
      this.uiManager.setTokensHeld(tokenIds);
      this.heldTokenIds = new Set(tokenIds);
      // A token released out of the players' sight now follows it.
      this.audience.refresh();
    });
    this.interactionController.setSelectionUpdateCallback(() => {
      if (typeof this.selectionOverlayUpdater === 'function') {
        this.selectionOverlayUpdater();
      }
    });
    
    // Before the collection's rules arrive: their refresh works the turn out again
    this.turnMarkers = new TurnMarkers({
      parent: this.viewport,
      getState: () => this.store.getState(),
      subscribe: (listener) => this.store.subscribe(listener),
      spriteOf: (tokenId) => this.tokenSprites[tokenId] ?? null,
      ticker: () => this.pixiApp?.ticker ?? null,
      reducedMotion: () => prefersReducedMotion(this.viewport.options?.events?.domElement ?? activeDocument.body),
      resources: () => this.resourceDefsProvider(),
    });
    this.collectionSync = new TokenCollectionSync(obsApp, store.getState, {
      refreshRules: () => this.refreshCollectionRules(),
      refreshArt: (path) => this.refreshArt(path),
    });
    this.interactionController.conditionDefsProvider = this.collectionSync.conditions;
    this.uiManager.conditionDefsProvider = this.collectionSync.conditions;
    this.resourceDefsProvider = this.collectionSync.resources;
    this.interactionController.resourceDefsProvider = this.resourceDefsProvider;
    this.uiManager.resourceDefsProvider = this.resourceDefsProvider;
    this.uiManager.measurementProvider = this.collectionSync.measurement;
    // Table mode is the players' picture for good: names follow the player view's Show nameplates, as in their window
    this.uiManager.tableNameplates = () => (this.store.getState().tableMode
      ? SettingsService.forApp(obsApp)?.get('localPlayerView').showTokenNameplates ?? false
      : undefined);
    this.statblockSync = new StatblockTokenSync(obsApp, store, tokenStatblockLinkService, this.resourceDefsProvider);

    // Initialize sync service
    this.syncService = new SyncService(createSceneSource(this.store, tokenSyncState));
    this.syncService.setTokensChangedCallback((newTokens, prevTokens) =>
      runInBackground(this.syncTokens(newTokens, prevTokens), 'Token sync')
    );

    // A render group: a change elsewhere in the viewport (a ruler drawn anew, a layer hidden for
    // the players' frame) then makes PIXI rebuild none of the tokens' draw list
    this.tokenContainer = new Container({ isRenderGroup: true });
    this.tokenContainer.label = 'tokenContainer';
    this.tokenContainer.sortableChildren = true;
    this.tokenContainer.eventMode = 'passive';
    this.tokenContainer.interactiveChildren = true;
    this.tokenContainer.zIndex = 0;
    this.viewport.addChild(this.tokenContainer);
    this.viewport.addChild(this.playerSight.outlineLayer);
    this.watchCanvasTurn();

    const movement = tokenMovement(this.obsApp, this.collectionSync.movement, this.collectionSync.measurement);
    this.movement = movement;
    this.dragRuler = new DragRuler(
      new DragRulerView(this.viewport, this.tokenContainer),
      this.gridSystem,
      this.store,
      this.collectionSync.measurement,
      (id) => this.tokenSprites[id]?.visible ?? false,
      () => showsDragDistance(SettingsService.forApp(this.obsApp)?.get('dragDistance') ?? DEFAULT_DRAG_DISTANCE, this.store.getState().initiative.isActive),
      movement,
    );
    this.interactionController.setDragRuler(this.dragRuler);
    this.interactionController.setTokenMovement(movement);

    // Initialize sync service
    this.syncService.initialize();

    this.pointer = tokenPointer({
      store: this.store,
      viewport: this.viewport,
      hitTest: (x, y) => this.hitTestTokens(x, y),
      interaction: this.interactionController,
      ui: this.uiManager,
    });

    // Only sync tokens if we have a valid map path
    // This prevents syncing with stale tokens from previous maps
    const currentMapPath = this.store.getState().mapPath;
    if (currentMapPath) {
      runInBackground(this.syncTokens(mapTokens(levelObjects(this.store.getState())), {}), 'Initial token sync');
      // Ensure all existing tokens (including ones without explicit ringColor)
      // get their ring rebuilt with the current renderer implementation.
      this.onWhenAllTokensLoaded(() => this.updateAllTokenSizes());
    }
    
    
    // Set up theme observer
    this.setupThemeObserver();
    
    
    
    // Fog changes what the players see even when no token or light changed.
    const gmViewUnsubscribe = this.store.subscribe((state, previous) => {
      if (levelObjects(state).fog !== levelObjects(previous).fog || state.mapPath !== previous.mapPath ||
          state.isMapLoading !== previous.isMapLoading) this.audience.refresh();
      if (state.tableMode !== previous.tableMode) this.followTableMode();
    });
    const origUnsubGM = this._unsubscribeFromStore;
    this._unsubscribeFromStore = () => {
      gmViewUnsubscribe();
      origUnsubGM?.();
    };

    // Refresh instance badges when showInstanceBadges setting changes
    let prevShowBadges = this.store.getState().tokenSettings?.showInstanceBadges ?? true;
    const badgesUnsubscribe = this.store.subscribe((state) => {
      const showBadges = state.tokenSettings?.showInstanceBadges ?? true;
      if (showBadges !== prevShowBadges) {
        prevShowBadges = showBadges;
        this.refreshInstanceBadges();
      }
    });
    const origUnsubBadges = this._unsubscribeFromStore;
    this._unsubscribeFromStore = () => {
      badgesUnsubscribe();
      origUnsubBadges?.();
    };

    // Listen for map load events to properly sync tokens
    const handleMapLoaded = (): void => {
      // Sprites still loading belong to the previous load and are discarded when they finish
      this.mapLoadGeneration++;
      this.tokensLoading = new Set();
      this.exit.finishAll();

      this.previousSceneArt = Object.values(this.tokenSprites).flatMap((group) => (group ? [group.artPath] : []));
      // First, clear all existing token sprites (tokenSprites is an object, not a Map)
      for (const tokenGroup of Object.values(this.tokenSprites)) {
        if (tokenGroup) this.freeTokenGroup(tokenGroup);
      }
      this.tokenSprites = {};
      this.playerBadges.reset();
      
      // Also clear token rings
      this.tokenRings = {};
      
      // Clear only token-specific UI elements, not the singleton controls
      // This preserves TokenControlsUI, TokenRotationUI, and TokenResizeUI
      this.uiManager.destroyAllTokenUIs();
      
      // Clear selection to ensure controls are hidden
      this.store.getState().clearSelection();
      
      // Then sync with the new map's tokens, keeping only their art decoded
      const currentTokens = mapTokens(levelObjects(this.store.getState()));
      this.evictUnusedArt();
      runInBackground(this.syncTokens(currentTokens, {}), 'Token sync after map change');
      this.onWhenAllTokensLoaded(() => this.updateAllTokenSizes());
      this.statblockSync.followRules();
    };
    
    this.eventBus.on('map-loaded', handleMapLoaded);
    
    // Listen for grid type changes to re-snap tokens
    this._handleGridTypeChange = (): void => {
      this.resnapAllTokens();
    };

    window.addEventListener('atlas-grid-type-changed', this._handleGridTypeChange);
    
    // Listen for rotation updates during drag
    this._handleRotationUpdate = (event): void => {
      const tokenIds = event.detail?.tokenIds || [];
      const tokens = mapTokens(levelObjects(this.store.getState()));

      // Apply the temporary rotation directly; syncTokens would skip the
      // token as unchanged because the store value has not moved yet.
      for (const tokenId of tokenIds) {
        const tokenGroup = this.tokenSprites[tokenId];
        const tempRotation = this.uiManager.getRotationUI()?.getTemporaryRotation(tokenId);
        if (tokens[tokenId] && tokenGroup instanceof Container && tempRotation !== undefined) {
          this.spriteFactory.updateTokenRotation(tokenGroup, tempRotation);
          this.uiManager.updateHandlePositions();
        }
      }
      // Art shown without a ring is outlined as it turns
      this.selectionOverlayUpdater();
    };

    window.addEventListener('atlas-tokens-rotation-update', this._handleRotationUpdate);
    
    // Listen for rotation start/end events to manage UI visibility
    this._handleRotationEnded = ((event: Event) => {
      // Re-show resize handles if tokens are still selected
      const selectedIds = this.store.getState().selectedIds;
      const isPlayerView = this.store.getState().isPlayerView;

      if (!isPlayerView && selectedIds.length > 0) {
        // Show resize handles for all selected tokens
        this.uiManager.getResizeUI()?.showHandles(selectedIds, this.getTokenSprites());
      }
      this.selectionOverlayUpdater();
    });

    // Listen for resize end events to re-show rotation handles
    this._handleResizeEnded = ((event: Event) => {
      // Re-show rotation handles if tokens are still selected
      const selectedIds = this.store.getState().selectedIds;
      const isPlayerView = this.store.getState().isPlayerView;

      if (!isPlayerView && selectedIds.length > 0) {
        // Show rotation handles for all selected tokens
        this.uiManager.getRotationUI()?.showHandles(selectedIds, this.getTokenSprites());
      }
      this.selectionOverlayUpdater();
    });

    window.addEventListener('atlas-token-rotation-ended', this._handleRotationEnded);
    window.addEventListener('atlas-token-resize-ended', this._handleResizeEnded);
    
    // Listen for resize updates during drag
    this._handleResizeUpdate = (event): void => {
      const tokenIds = event.detail?.tokenIds || [];
      const tokens = mapTokens(levelObjects(this.store.getState()));

      // Get temporary sizes from resize UI
      for (const tokenId of tokenIds) {
        const token = tokens[tokenId];
        if (token) {
          const tempSize = this.uiManager.getResizeUI()?.getTemporarySize(tokenId);
          if (tempSize !== undefined) {
            // Update the visual size without storing to state
            const tokenGroup = this.tokenSprites[tokenId];
            if (tokenGroup instanceof Container) {
              this.spriteFactory.updateTokenSize(tokenId, tokenGroup, tempSize);
              const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, tempSize);
              this.uiManager.syncUIScale(tokenId, tokenSize);
              this.updateTokenRing(tokenId, tokenGroup, tokenSize, token.ringColor);
            }
          }
        }
      }
      this.selectionOverlayUpdater();
    };

    window.addEventListener('atlas-tokens-resize-update', this._handleResizeUpdate);
    
    // Store cleanup function
    const originalUnsubscribe = this._unsubscribeFromViewport;
    this._unsubscribeFromViewport = () => {
      if (originalUnsubscribe) originalUnsubscribe();
      // Clean up map load listeners
      this.eventBus.off('map-loaded', handleMapLoaded);
      // Clean up metadata change listener
      this.statblockSync.destroy();
      this.collectionSync.destroy();
    };
    this.stopDrawingForAudience = audience.drawTokens({ show: () => this.showPlayersView(), perception: () => this.playerSight.perception() });
  }
  
  /** Runs `callback` once every token sprite being created has loaded (immediately if none is). */
  public onWhenAllTokensLoaded(callback: () => void): void {
    if (this.tokensLoading.size === 0) {
      callback();
      return;
    }
    this.allTokensLoadedCallbacks.push(callback);
  }

  // Backward-compatible alias used by older call sites during renderer initialization.
  public setAllTokensLoadedCallback(callback: () => void): void {
    this.onWhenAllTokensLoaded(callback);
  }
  
  private checkAllTokensLoaded(): void {
    if (this.tokensLoading.size > 0) return;
    const callbacks = this.allTokensLoadedCallbacks;
    this.allTokensLoadedCallbacks = [];
    for (const callback of callbacks) callback();
  }
  
  private restack(): void {
    for (const [id, group] of Object.entries(this.tokenSprites)) if (group) this.placeInPile(id, group);
    this.requestSort();
  }

  private placeInPile(id: string, group: TokenGroupContainer): void {
    const place = this.pile.placeOf(id);
    group.zIndex = place;
    this.uiManager.setPilePlace(id, place);
  }

  private requestSort(): void {
    if (this.sortPending) return;
    
    this.sortPending = true;
    
    // Clear any existing timeout
    if (this.sortTimeout !== null) {
      window.clearTimeout(this.sortTimeout);
    }
    
    // Use requestAnimationFrame instead of setTimeout for better performance
    window.requestAnimationFrame(() => {
      if (!this.sortPending) return; // Double check in case it was cancelled
      
      // Only sort if we have children
      if (this.tokenContainer.children.length > 0) {
        this.tokenContainer.sortChildren();
      }
      
      this.sortPending = false;
      this.sortTimeout = null;
    });
  }

  private reestablishTokenInteractivity(tokenGroup: Container): void {
    const isPlayerView = this.store.getState().isPlayerView || false;
    
    // Update the isPlayerView flag used by InteractionController
    this.interactionController.isPlayerView = isPlayerView;
    this.spriteFactory.isPlayerView = isPlayerView;

    // Token art is never an event target (viewport-level dispatch handles token clicks), but the
    // children must stay hit-testable so resize/rotate handles parented to the group receive pointer events.
    tokenGroup.eventMode = 'passive';
    tokenGroup.interactiveChildren = true;
  }

  private updateTokenRing(tokenId: string, tokenGroup: TokenGroupContainer, size: number, ringColor?: string): void {
    const current = mapTokens(levelObjects(this.store.getState()))[tokenId];
    if (current) tokenGroup.tokenData = current;
    const sizeWithMultiplier = size * (this.store.getState().tokenSettings?.tokenRingSize ?? 1);
    const resolvedRingColor = ringColor || '#ffffff';

    // Route all ring redraws through SpriteFactory to keep visuals consistent
    // between initial create and subsequent updates (size/color changes).
    const ring = this.spriteFactory.createTokenRing(tokenGroup, resolvedRingColor, sizeWithMultiplier);
    syncTokenArtwork(tokenGroup, size);
    this.downedTokenOverlay.refresh(tokenGroup);
    this.overlays.refresh(tokenGroup);
    if (ring) {
      this.tokenRings[tokenId] = ring;
    } else {
      delete this.tokenRings[tokenId];
    }

    // Update instance badge position/size for ring size changes
    if (current) this.drawInstanceBadge(current, tokenGroup, this.countTokensWithImage(current.imagePath), sizeWithMultiplier);
  }

  /**
   * Re-evaluates instance badges for every token on the map.
   * Tokens whose sprite is still loading get their badge from `refreshInstanceBadge` once loaded.
   */
  private refreshInstanceBadges(): void {
    // Counted among every token of the scene, those beside the map too, so a badge is the number its tracker card shows
    const tokens = Object.values(sceneTokens(levelObjects(this.store.getState())));
    const countByImage = new Map<string, number>();
    for (const token of tokens) {
      countByImage.set(token.imagePath, (countByImage.get(token.imagePath) ?? 0) + 1);
    }

    for (const token of tokens) {
      const tokenGroup = this.tokenSprites[token.id];
      if (tokenGroup) this.drawInstanceBadge(token, tokenGroup, countByImage.get(token.imagePath) ?? 0);
    }
    this.audience.tokensChanged();
  }

  /** Draws the badge of a single token, e.g. one whose sprite finished loading after the last sync. */
  private refreshInstanceBadge(tokenId: string): void {
    const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
    const tokenGroup = this.tokenSprites[tokenId];
    if (token && tokenGroup) this.drawInstanceBadge(token, tokenGroup, this.countTokensWithImage(token.imagePath));
  }

  private countTokensWithImage(imagePath: string): number {
    const tokens = Object.values(sceneTokens(levelObjects(this.store.getState())));
    return tokens.filter((token) => token.imagePath === imagePath).length;
  }

  private drawInstanceBadge(
    token: TokenEntity,
    tokenGroup: TokenGroupContainer,
    sameImageCount: number,
    size: number = tokenGroup.tokenSize || 70
  ): void {
    const showBadges = this.store.getState().tokenSettings?.showInstanceBadges ?? true;
    updateInstanceBadge(tokenGroup, token.instanceNumber ?? 1, size, showBadges && sameImageCount >= 2);
  }

  /** Whether the canvas leaves `token` out: a hidden one in the players' perspective, and one the players' sight leaves out. */
  private hidesToken(token: TokenEntity, perception = this.playerSight.perception()): boolean {
    return ((token.isHidden ?? false) && this.audience.takesPlayersPerspective()) || this.playerSight.hides(token.id, perception);
  }

  /** Whether the canvas shows the token: it is on the map and neither the players' perspective nor their sight leaves it out. */
  /** A player's token met a wall or a closed door on a step towards `(dx, dy)`: it bumps there, on this canvas and so in the player window. */
  public bumpToken(tokenId: string, dx: number, dy: number): void {
    this.bumps.bump(tokenId, dx, dy);
  }

  public showsToken(tokenId: string): boolean {
    const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
    return token !== undefined && !this.hidesToken(token);
  }

  /** A token the canvas no longer shows cannot stay selected: its handles would float over nothing. */
  private deselect(tokenId: string): void {
    const { selectedIds, setSelection } = this.store.getState();
    if (selectedIds.includes(tokenId)) setSelection(selectedIds.filter((id) => id !== tokenId));
  }

  private applyTokenVisibilityPolicy(
    token: TokenEntity,
    tokenGroup: Container,
    prevToken?: TokenEntity,
    perception = this.playerSight.perception(),
  ): void {
    const isHidden = token.isHidden ?? false;

    if (this.hidesToken(token, perception)) {
      tokenGroup.visible = false;
      tokenGroup.alpha = 1.0;
      this.uiManager.setTokenUIVisibility(token.id, false);
      this.deselect(token.id);
      return;
    }

    tokenGroup.visible = true;
    this.uiManager.setTokenUIVisibility(token.id, true);
    tokenGroup.alpha = isHidden ? HIDDEN_TOKEN_ALPHA : 1.0;

    this.hiddenTokenIcon.update(tokenGroup, isHidden);

    if (!prevToken || (prevToken.isHidden ?? false) !== isHidden) {
      this.reestablishTokenInteractivity(tokenGroup);
    }
  }

  /** Another plugin added or took back an overlay, or its picture arrived: every token draws the overlays anew. */
  private redrawOverlays(): void {
    for (const group of Object.values(this.tokenSprites)) if (group && !group.destroyed) this.overlays.update(group);
    if (this.pixiApp) requestRender(this.pixiApp);
  }

  /** Greys out a token at 0 HP and marks it with a skull; killing and healing a loaded token animate. */
  private applyDownedState(token: TokenEntity, tokenGroup: TokenGroupContainer, prevToken?: TokenEntity): void {
    const definitions = this.resourceDefsProvider();
    const downed = isTokenDowned(token, definitions);
    const canvas = this.pixiApp?.canvas;
    const animate = prevToken !== undefined && isTokenDowned(prevToken, definitions) !== downed && !!canvas && !prefersReducedMotion(canvas);
    this.downedTokenOverlay.update(tokenGroup, downed, animate);
  }

  /** How the players perceive each token while this canvas shows their view of a lit scene (`PlayerSightTokens.setProvider`). */
  public setPlayerSightProvider(provider: () => TokenPerception | undefined, current?: () => boolean): void {
    this.playerSight.setProvider(provider, current);
  }

  /** Shares the committed coverage with the fog renderer, independently of lighting. */
  public setFogCoverageProvider(provider: () => FogCoverage | null): void {
    this.playerSight.setFogProvider(provider);
    this.audience.refresh();
  }

  /** The roof drawn over the players' picture (`ViewRoofs.covers`): tokens under it are left out of their view. */
  public setRoofProvider(covers: (point: Point) => boolean): void {
    this.playerSight.setRoofProvider(covers);
    this.audience.refresh();
  }

  /**
   * Whether a move the store made may be shown as a glide. On a lit scene the players see a token by where the
   * store has it, so one that comes into their sight would be shown on its way from a place they did not see,
   * giving away where it stood. There only tokens they see wherever they stand (the party's), or never (hidden
   * ones), glide; any other is put in its place at once.
   */
  private mayGlide(token: TokenEntity, prevToken: TokenEntity | undefined): boolean {
    if (!this.playerSight.hasLighting() || !this.store.getState().lighting?.enabled) return true;
    if (!prevToken) return false;
    const { alwaysSeen } = PLAYER_SIGHT_POLICY;
    return (!!token.isHidden && !!prevToken.isHidden) || (alwaysSeen(token) && alwaysSeen(prevToken));
  }

  /** The way a token faces on the canvas: as a turn under way shows it, else as the store has it. */
  private shownRotation(token: TokenEntity): number {
    return this.uiManager.getRotationUI()?.getTemporaryRotation(token.id) ?? this.groupFacings?.get(token.id) ?? token.rotation ?? 0;
  }

  /** What a group turned from the button above its selection frame asks of the tokens (`GroupRotation`). */
  public groupTurnHost(): GroupTurnHost {
    return {
      pivot: (middle) => {
        if (!(this.store.getState().grid?.snapToGrid ?? true)) return middle;
        const hex = isHexGridType(this.gridSystem.getOptions().type);
        return gridPivot(middle, hex, (point, size) => this.gridSystem.snapTokenCenter(point.x, point.y, size));
      },
      showFacings: (facings) => this.showFacings(facings),
    };
  }

  /** Shows the tokens of a group being turned facing these ways until it is put down; null shows them as the store has them. */
  private showFacings(facings: ReadonlyMap<string, number> | null): void {
    const turned = facings ?? this.groupFacings;
    this.groupFacings = facings;
    if (!turned) return;
    const tokens = mapTokens(levelObjects(this.store.getState()));
    for (const id of turned.keys()) {
      const group = this.tokenSprites[id];
      const token = tokens[id];
      if (group && token) this.spriteFactory.updateTokenRotation(group, this.shownRotation(token));
    }
    // Art shown without a ring is outlined as it turns
    this.selectionOverlayUpdater();
  }

  /** Takes along what stands with a token beside its sprite and UI as it is drawn at a new place: what the players see of it, and the selection frame. */
  private followToken(tokenId: string): void {
    this.refreshDisplayedToken(tokenId);
    if (this.store.getState().selectedIds.includes(tokenId)) this.selectionOverlayUpdater();
  }

  /** Movement can lead the store; apply fog before the displayed position is rendered. */
  private refreshDisplayedToken(tokenId: string): void {
    const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
    const sprite = this.tokenSprites[tokenId];
    const perception = this.playerSight.perception();
    if (!token || !sprite || !perception) return;
    this.applyTokenVisibilityPolicy(token, sprite, token, perception);
    this.playerSight.syncOutline(tokenId, perception);
    this.audience.moved(tokenId, seenByPlayers(mapTokens(levelObjects(this.store.getState())), perception)(tokenId));
  }

  /** The tokens the canvas shows: those a selection may take. */
  public visibleTokenIds(): string[] {
    return Object.entries(this.tokenSprites).filter(([, tokenGroup]) => tokenGroup?.visible).map(([id]) => id);
  }

  /** Shows the tokens as the canvas is drawn for now (`CanvasAudience.refresh`): those entering or leaving the players' sight show or hide. */
  private showPlayersView(): void {
    const tokens = mapTokens(levelObjects(this.store.getState()));
    const perception = this.playerSight.perception();
    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      const token = tokens[id];
      if (!token || !tokenGroup || tokenGroup.visible !== this.hidesToken(token, perception)) continue;
      this.applyTokenVisibilityPolicy(token, tokenGroup, token, perception);
    }
    this.playerSight.syncOutlines(perception);
    this.uiManager.setPlayersView(this.audience.showsPlayers());
    this.syncCanvasTurn();
    this.dragRuler.refreshVisibility();
  }

  /** Table mode began or ended: the names follow it, and nothing stays hovered under a pointer the tools no longer hear. */
  private followTableMode(): void {
    this.uiManager.setHoverState(null);
    this.uiManager.refreshResources();
    this.passTableBadges();
  }

  /**
   * In Table mode no players' frame is rendered, which is what hands their initiative list its badge
   * numbers (`getPlayerViewLayers`): the canvas hands them on whenever what the players see changes.
   */
  private passTableBadges(): void {
    if (!this.store.getState().tableMode) return;
    const seen = this.playerSight.sightIsCurrent() ? this.audience.seenOnCanvas() : null;
    this.playerBadges.pass(seen ?? NOTHING_SEEN);
  }

  /**
   * The turn flashes on the canvas: while it shows the players' view (session view, the peek, the
   * palette's player mode) only where the players are shown their initiative list, as their frame.
   */
  private syncCanvasTurn(): void {
    const showsPlayers = this.audience.showsPlayers();
    const view = SettingsService.forApp(this.obsApp)?.get('localPlayerView');
    this.turnMarkers.showOnCanvas(!showsPlayers || ((view?.showInitiative ?? false) && this.store.getState().initiativeTrackerOpen));
  }

  /** Keeps the canvas's turn flashes in step with the players' view, the player view's settings and the tracker. */
  private watchCanvasTurn(): void {
    const stopView = this.audience.onChange(() => {
      this.syncCanvasTurn();
      this.passTableBadges();
    });
    const stopSettings = SettingsService.forApp(this.obsApp)?.onChange(() => this.syncCanvasTurn());
    const stopStore = this.store.subscribe((state, previous) => {
      if (state.initiativeTrackerOpen !== previous.initiativeTrackerOpen) this.syncCanvasTurn();
    });
    const earlier = this._unsubscribeFromStore;
    this._unsubscribeFromStore = () => {
      stopView();
      stopSettings?.();
      stopStore();
      earlier?.();
    };
    this.syncCanvasTurn();
  }

  /** The layer of the sensed tokens' outlines, for the list of what the players' view shows. */
  public getSensedOutlineLayer(): HideableLayer {
    return this.playerSight.outlineLayer;
  }

  private syncTokens = async (
    tokensRecord: Record<string, TokenEntity>,
    prevTokensRecord: Record<string, TokenEntity>
  ): Promise<void> => {

    // Syncs queued before destroy() may still run afterwards
    if (this.isDestroyed) {
      return;
    }

    const container = this.tokenContainer;
    const newIds = new Set(Object.keys(tokensRecord));

    // Use this.tokenSprites as source of truth for what sprites exist,
    // not prevTokensRecord which may be stale or incomplete from Zustand batching
    const spriteIds = Object.keys(this.tokenSprites);

    // Detect which tokens actually changed (for incremental updates)
    const changedTokenIds = new Set<string>();
    const newTokenIds = new Set<string>();
    const deletedTokenIds = new Set<string>();

    // Find deleted tokens
    for (const id of spriteIds) {
      if (!newIds.has(id)) {
        deletedTokenIds.add(id);
      }
    }

    // Find new and changed tokens
    for (const [id, token] of Object.entries(tokensRecord)) {
      const prevToken = prevTokensRecord?.[id];
      if (!prevToken) {
        newTokenIds.add(id);
      } else if (this.hasTokenChanged(token, prevToken)) {
        changedTokenIds.add(id);
      }
    }

    const totalChanges = changedTokenIds.size + newTokenIds.size + deletedTokenIds.size;
    if (this.pile.update(tokensRecord)) this.restack();

    // Deleted tokens leave the renderer at once and play out on their own
    const leaving = this.releaseLeavingTokens(deletedTokenIds);
    this.exit.play(leaving, (group) => {
      this.freeTokenGroup(group);
      this.evictUnusedArt();
    });

    // Process only changed and new tokens (skip unchanged tokens entirely)
    for (const token of Object.values(tokensRecord)) {
      const existingSprite = this.tokenSprites[token.id];
      const prevToken = prevTokensRecord?.[token.id];
      const isNewToken = newTokenIds.has(token.id);
      const isChangedToken = changedTokenIds.has(token.id);

      // Skip unchanged existing tokens entirely (major optimization)
      if (existingSprite !== undefined && !isNewToken && !isChangedToken) {
        continue;
      }

      // Skip if we have a token sprite (including placeholder)
      if (existingSprite !== undefined) {
        // If it's still being created (null placeholder), skip
        if (existingSprite === null) {
          continue;
        }
        const existingTokenGroup = existingSprite;

        // Only update position if it changed
        if (!prevToken || prevToken.x !== token.x || prevToken.y !== token.y) {
          const loading = this.store.getState().isMapLoading;
          this.places.storeMoved(token.id, token.x, token.y, { loading, mayGlide: () => this.mayGlide(token, prevToken) });
          
          // Update rotation handle positions when token moves
          this.uiManager.updateHandlePositions();
        }
        
        // Update rotation if it changed or if there's a temporary rotation
        const tempRotation = this.uiManager.getRotationUI()?.getTemporaryRotation(token.id);
        this.spriteFactory.updateTokenRotation(existingTokenGroup, this.shownRotation(token));
        
        // Update rotation handle positions when token rotates
        if (!prevToken || prevToken.rotation !== token.rotation || tempRotation !== undefined) {
          this.uiManager.updateHandlePositions();
        }
        
        // Check for temporary size during resize
        const tempSize = this.uiManager.getResizeUI()?.getTemporarySize(token.id);
        
        // Update resize handle positions when token size changes
        const sizeChanged = !prevToken || prevToken.size !== token.size || tempSize !== undefined;
        if (sizeChanged) {
          this.uiManager.getResizeUI()?.updateHandlePositions();
          // Also update rotation handles since token size affects their position
          // Build temporary sizes map for all tokens
          const tempSizes: Record<string, number> = {};
          if (tempSize !== undefined) {
            tempSizes[token.id] = tempSize;
          }
          this.uiManager.getRotationUI()?.updateHandlePositions(undefined, tempSizes);
        }
        
        // Update size if it changed (not temporary)
        if (!prevToken || prevToken.size !== token.size) {
          // Only update actual size if there's no temporary size override
          if (tempSize === undefined) {
            const newSize = token.size || 1;
            this.spriteFactory.updateTokenSize(token.id, existingTokenGroup, newSize);
            const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, newSize);
            
            // Update UI scale
            this.uiManager.syncUIScale(token.id, tokenSize);
            
            // Always refresh ring, even when token has no explicit ringColor.
            this.updateTokenRing(token.id, existingTokenGroup, tokenSize, token.ringColor);
          }
        }

        if (!prevToken || token.imagePath !== prevToken.imagePath) {
          try {
            await this.updateTokenSpriteTexture(token, existingTokenGroup);
          } catch (error) {
            console.error(`[TokenRenderer] Failed to update token texture for ${token.id}:`, error);
          }
        }
        
        this.applyTokenVisibilityPolicy(token, existingTokenGroup, prevToken);
        this.applyDownedState(token, existingTokenGroup, prevToken);
        this.overlays.update(existingTokenGroup);
        
        // Update ring color if it changed
        const newRingColor = token.ringColor;
        const prevRingColor = prevToken?.ringColor;
        if (newRingColor !== prevRingColor || token.showRing !== prevToken?.showRing) {
          // Calculate token size for ring update
          const currentSize = tempSize !== undefined ? tempSize : (token.size || 1);
          const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, currentSize);
          
          this.updateTokenRing(token.id, existingTokenGroup, tokenSize, newRingColor);
        }
        
        // Update token UI with any state changes
        this.uiManager.updateTokenUI(token.id, token);
        
        continue;
      }
      
      // Mark token as loading to prevent duplicate creation
      this.tokenSprites[token.id] = null;
      this.tokensLoading.add(token.id);
      const generation = this.mapLoadGeneration;
      
      // Create new token sprite asynchronously
      void (async () => {
        let heldArt: string | null = null;
        let tokenGroup: TokenGroupContainer | null = null;
        try {
          const character = await this.statblockSync.prepareToken(token);

          // Load texture; the group holds it from here on
          heldArt = character.imagePath ?? '';
          const texture = await this.textureCache.acquire(heldArt);
          
          // Create sprite through factory
          tokenGroup = await this.spriteFactory.createTokenSprite(character, texture);
          // On the GPU before the token is added: the frame that first draws it, often a scene's reveal, uploads nothing.
          // Outside a load, tokens are added a few a frame.
          await this.artUploads.whenUploaded(texture.source, this.distanceFromView(token));

          // Another map loaded meanwhile (possibly this one again, with its own load of this
          // token), so this sprite must neither show nor touch the new load's state.
          if (this.isStaleLoad(generation)) {
            this.freeTokenGroup(tokenGroup);
            this.evictUnusedArt();
            return;
          }

          // Syncs skip tokens whose sprite is still loading, so check what happened meanwhile.
          const latest = mapTokens(levelObjects(this.store.getState()))[token.id];
          if (!latest) {
            // Removed while loading, e.g. a paste undone straight away: never show it.
            this.freeTokenGroup(tokenGroup);
            this.evictUnusedArt();
            delete this.tokenSprites[token.id];
            this.tokensLoading.delete(token.id);
            this.checkAllTokensLoaded();
            return;
          }

          container.addChild(tokenGroup);
          this.tokenSprites[token.id] = tokenGroup;
          // The sync that added this token refreshed badges before its sprite existed
          this.refreshInstanceBadge(token.id);
          this.tokensLoading.delete(token.id);
          this.checkAllTokensLoaded();
          this.uiManager.createTokenUI(token.id, tokenGroup, character);
          this.placeInPile(token.id, tokenGroup);
          
          this.applyTokenVisibilityPolicy(character, tokenGroup);
          this.applyDownedState(character, tokenGroup);
          this.overlays.update(tokenGroup);

          // A token selected before its sprite existed (it took stairs to the level the view
          // followed it to) gets the frame and handles a selection change drew without it
          const { selectedIds } = this.store.getState();
          if (selectedIds.includes(token.id)) {
            this.uiManager.updateSelectionUI(selectedIds);
            this.selectionOverlayUpdater();
          }
          
          // Request sort for proper z-ordering
          this.requestSort();
          
          // Also ensure viewport sorts its children to maintain UI above tokens
          this.viewport.sortChildren();
          this.audience.sightChanged({ kind: 'token' });

          // Changes made while loading (an Alt-drag copy moving, a pasted token rotated) go
          // through the regular update path, diffed against the state the sprite was built from.
          if (latest !== token) {
            const current = mapTokens(levelObjects(this.store.getState()));
            runInBackground(this.syncTokens(current, { ...current, [token.id]: token }), 'Token sync after sprite load');
          }
        } catch (error) {
          console.error(`[TokenRenderer] Failed to create sprite for token ${token.id}:`, error);
          // Undo what this load built: its group, which holds the art, or just the hold
          if (tokenGroup) this.freeTokenGroup(tokenGroup);
          else if (heldArt !== null) this.textureCache.release(heldArt);
          if (this.isStaleLoad(generation)) return;
          delete this.tokenSprites[token.id];
          this.uiManager.destroyTokenUI(token.id);
          this.tokensLoading.delete(token.id);
          this.checkAllTokensLoaded();
        }
      })();
    }

    // Update instance badges for all tokens after any changes; this also tells whoever follows the players' view
    if (totalChanges > 0) {
      this.refreshInstanceBadges();
    }

    // A selected token that was resized or moved (size menu, undo) takes its selection frame along
    if (this.store.getState().selectedIds.some((id) => changedTokenIds.has(id))) {
      this.selectionOverlayUpdater();
    }
  };

  /** Shows the new content of a changed image file on every token that uses it. */
  private async refreshArt(path: string): Promise<void> {
    const key = normalizeImagePath(path);
    const reloaded = await this.textureCache.reload(path, (texture) => {
      for (const tokenGroup of Object.values(this.tokenSprites)) {
        if (!tokenGroup || normalizeImagePath(tokenGroup.artPath) !== key) continue;
        const sprite = tokenGroup.getChildByLabel('tokenSprite');
        if (sprite instanceof Sprite) sprite.texture = texture;
        fitTokenArtwork(tokenGroup);
      }
    });
    if (reloaded && this.pixiApp) requestRender(this.pixiApp);
  }

  private async updateTokenSpriteTexture(token: TokenEntity, tokenGroup: TokenGroupContainer): Promise<void> {
    const sprite = tokenGroup.getChildByLabel('tokenSprite') as Sprite | null;
    if (!sprite) {
      return;
    }

    const artPath = token.imagePath ?? '';
    const texture = await this.textureCache.acquire(artPath);

    // Abort if this sprite was replaced while awaiting texture load.
    if (this.tokenSprites[token.id] !== tokenGroup) {
      this.textureCache.release(artPath);
      this.evictUnusedArt();
      return;
    }

    sprite.texture = texture;
    tokenGroup.tokenData = token;
    const previousArtPath = tokenGroup.artPath;
    tokenGroup.artPath = artPath;
    fitTokenArtwork(tokenGroup);

    this.textureCache.release(previousArtPath);
    this.evictUnusedArt();
  }

  /**
   * Checks if a token has any property changes that require visual updates.
   * Used by syncTokens for incremental updates optimization.
   */
  private hasTokenChanged(token: TokenEntity, prevToken: TokenEntity): boolean {
    // Position changes
    if (token.x !== prevToken.x || token.y !== prevToken.y) return true;

    // Rotation changes
    if (token.rotation !== prevToken.rotation) return true;

    // Layer/z-index changes
    if (token.layer !== prevToken.layer) return true;

    // Size changes
    if (token.size !== prevToken.size) return true;

    // Ring color changes
    if (token.ringColor !== prevToken.ringColor || token.showRing !== prevToken.showRing) return true;

    // Visibility/hidden state changes
    if (token.isHidden !== prevToken.isHidden) return true;

    // Nameplate changes
    if (token.showNameplate !== prevToken.showNameplate) return true;

    // Height off the floor, which the chip over the token says
    if (token.elevation !== prevToken.elevation) return true;

    // Conditions, compared by value
    if ((token.conditions ?? []).join() !== (prevToken.conditions ?? []).join()) return true;
    if (token.conditionValues !== prevToken.conditionValues) return true;

    // Character data: name, resources (compared by value) and statblock link
    const character = token.kind === 'character' ? token : undefined;
    const prevCharacter = prevToken.kind === 'character' ? prevToken : undefined;
    if (character?.name !== prevCharacter?.name) return true;
    if (token.resources !== prevToken.resources && JSON.stringify(token.resources) !== JSON.stringify(prevToken.resources)) return true;
    if (character?.statblockPath !== prevCharacter?.statblockPath) return true;

    // Texture source changes
    if (token.imagePath !== prevToken.imagePath) return true;

    return false;
  }

  /**
   * Takes the sprites of tokens that left the map (deleted, or gone beside it by an undone Place on
   * Map) out of the renderer and the selection, and hands back their groups to play out. A token
   * beside the map keeps no selection: Delete would take it unseen.
   */
  private releaseLeavingTokens(ids: Iterable<string>): TokenGroupContainer[] {
    const leaving: TokenGroupContainer[] = [];
    for (const id of ids) {
      const tokenGroup = this.tokenSprites[id];
      this.places.cancel(id);
      this.bumps.cancel(id);
      this.deselect(id);
      if (tokenGroup) {
        delete this.tokenSprites[id];
        // Clean up ring tracking (ring is destroyed with tokenGroup)
        delete this.tokenRings[id];
        this.uiManager.destroyTokenUI(id);
        leaving.push(tokenGroup);
      }
    }
    return leaving;
  }

  /** Destroys a token group with all of its children and drops its hold on its art. */
  private freeTokenGroup(tokenGroup: TokenGroupContainer): void {
    this.downedTokenOverlay.release(tokenGroup);
    this.spriteFactory.destroyTokenSprite(tokenGroup);
    this.textureCache.release(tokenGroup.artPath);
  }

  /** Whether a sprite load started for map load `generation` finished after a newer load or destroy. */
  private isStaleLoad(generation: number): boolean {
    return this.isDestroyed || generation !== this.mapLoadGeneration;
  }

  /**
   * Frees decoded art no token holds, keeping the art of every token on the map, on every level: a
   * floor switched back to decodes and uploads none of its art again.
   */
  private evictUnusedArt(): void {
    const tokens = Object.values(mapTokens(everyLevelObjects(this.store.getState())));
    this.textureCache.evictUnused([...tokens.map((token) => token.imagePath ?? ''), ...this.previousSceneArt]);
  }

  /** World distance of `token` from the centre of the view, which orders art uploads. */
  private distanceFromView(token: TokenEntity): number {
    const center = this.viewport.center;
    return Math.hypot(token.x - center.x, token.y - center.y);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.stopDrawingForAudience();
    this.exit.finishAll();
    this.artUploads.destroy();

    // Unsubscribe from store
    this._unsubscribeFromStore?.();
    this._unsubscribeFromViewport?.();
    
    // Clean up sync service
    this.syncService.destroyAll();
    
    // Clear any pending sort
    if (this.sortTimeout !== null) {
      window.clearTimeout(this.sortTimeout);
      this.sortTimeout = null;
    }
    
    // Clean up all sprites first
    for (const tokenGroup of Object.values(this.tokenSprites)) {
      // Remove all event listeners from the tokenGroup
      tokenGroup?.removeAllListeners();
    }
    
    // Destroy all UI elements through UIManager
    this.uiManager.destroyAll();
    
    // Destroy interaction controller
    this.interactionController.destroyAll();
    this.dragRuler.destroy();
    this.places.destroy();
    this.bumps.destroy();
    this.playerSight.destroy();
    this.turnMarkers.destroy();
    
    this.stopThemeWatch?.();
    this.stopThemeWatch = null;
    
    // Clean up event listeners
    // Remove window event listeners using properly typed handlers
    if (this._handleGridTypeChange) {
      window.removeEventListener('atlas-grid-type-changed', this._handleGridTypeChange);
      delete this._handleGridTypeChange;
    }

    if (this._handleRotationUpdate) {
      window.removeEventListener('atlas-tokens-rotation-update', this._handleRotationUpdate);
      delete this._handleRotationUpdate;
    }

    if (this._handleResizeUpdate) {
      window.removeEventListener('atlas-tokens-resize-update', this._handleResizeUpdate);
      delete this._handleResizeUpdate;
    }

    if (this._handleRotationEnded) {
      window.removeEventListener('atlas-token-rotation-ended', this._handleRotationEnded);
      delete this._handleRotationEnded;
    }

    if (this._handleResizeEnded) {
      window.removeEventListener('atlas-token-resize-ended', this._handleResizeEnded);
      delete this._handleResizeEnded;
    }
    
    // Now destroy the container and its children. 
    // Textures associated with sprites in tokenContainer should be handled by PixiAppManager.destroy
    // if they were not individually destroyed from the cache.
    destroyTree(this.tokenContainer);
    
    // Destroy all cached textures using centralized method
    this.textureCache.destroyAll();
    this.hiddenTokenIcon.destroy();
    this.downedTokenOverlay.destroy();
    this.stopFollowingOverlays();
    this.stopWatchingCorners();
    
    // Clear all references
    this.tokenSprites = {};
    this.tokenRings = {};

    this.pixiApp = null;
  }

  // Helper function to get MIME type (simplified)
  private getMimeType(extension: string): string | undefined {
    switch (extension.toLowerCase()) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'svg': return 'image/svg+xml';
      default: return undefined;
    }
  }

  /** Redraws what tokens show of their collection's rules (conditions, resources), and linked tokens follow their resources. */
  private refreshCollectionRules(): void {
    if (this.isDestroyed) return;
    this.turnMarkers.refresh();
    this.uiManager.refreshConditions();
    this.uiManager.refreshResources();
    this.statblockSync.followRules();
  }

  /** The rotation and resize handles take the light or dark theme's colours. */
  private setupThemeObserver(): void {
    this.stopThemeWatch = watchDarkTheme(viewportDocument(this.viewport).body, () => {
      this.uiManager.getRotationUI()?.updateTheme();
      this.uiManager.getResizeUI()?.updateTheme();
    });
  }

  /**
   * Re-snaps all tokens to the current grid type
   * Called when grid type changes (e.g., from square to hex)
   */
  private resnapAllTokens(): void {
    const currentState = this.store.getState();
    const grid = currentState.grid;
    const snapToGrid = grid && typeof grid.snapToGrid === 'boolean' ? grid.snapToGrid : true;
    
    if (!snapToGrid) {
      return;
    }
    
    const tokens = mapTokens(levelObjects(currentState));
    const tokenUpdates: Array<{id: string, x: number, y: number}> = [];
    
    // Re-snap each token to the new grid type
    for (const [tokenId, token] of Object.entries(tokens)) {
      const tokenSprite = this.tokenSprites[tokenId];
      if (!tokenSprite) continue;
      
      // Get current position and snap to new grid
      const currentPos = { x: token.x, y: token.y };
      const snappedPos = this.gridSystem.snapTokenCenter(currentPos.x, currentPos.y, token.size || 1);
      
      // Only update if position actually changed
      if (Math.abs(snappedPos.x - currentPos.x) > 0.1 || Math.abs(snappedPos.y - currentPos.y) > 0.1) {
        // Drawn there at once, for visual feedback
        this.places.put(tokenId, snappedPos.x, snappedPos.y);
        tokenUpdates.push({id: tokenId, x: snappedPos.x, y: snappedPos.y});
      }
    }
    
    // Bulk update positions in store if any tokens moved
    if (tokenUpdates.length > 0) {
      this.store.getState().setTokenPositions(tokenUpdates);
    }
  }

  /** The app whose ticker, canvas and renderer the tokens use. */
  public setPixiApp(app: Application | null): void {
    this.pixiApp = app;
    this.turnMarkers.followTicker();
    if (app) {
      this.textureCache.setPixiApp(app);
    }
  }

  /**
   * How a players' frame perceives each token: `lighting` (the scene's lighting) with
   * committed fog, whatever the canvas itself shows. Reads only.
   */
  public playerFramePerception(lighting?: TokenPerception): TokenPerception | undefined {
    return this.playerSight.framePerception(lighting);
  }

  /** The GM's instance numbers the players' last frame showed them, for their initiative list. */
  public playerBadgeNumbers(): PlayerBadgeNumbers {
    return this.playerBadges;
  }

  /** Whether the players see each token in their frame, by `lighting` with committed fog; never a hidden or missing one. */
  public playersSeeInFrame(lighting?: TokenPerception): TokenSeen {
    return seenByPlayers(mapTokens(levelObjects(this.store.getState())), this.playerFramePerception(lighting));
  }

  /**
   * Player overlays prepared for the next mirrored frame; `perception` leaves out what the players do not see, outlines
   * what they only sense and takes the GM's instance numbers of what they see for their initiative list, none while the lighting has no sight for the scene.
   */
  public getPlayerViewLayers(settings: AtlasSettings['localPlayerView'], perception?: TokenPerception): LayerVisibility[] {
    perception = this.playerFramePerception(perception);
    const isSeen = seenTokens(perception);
    const state = this.store.getState();
    this.playerBadges.pass(this.playerSight.sightIsCurrent() ? seenByPlayers(mapTokens(levelObjects(state)), perception) : NOTHING_SEEN);
    // Players learn of the turn only where their initiative list shows it
    const turnShown = settings.showInitiative && state.initiativeTrackerOpen;
    return [...this.playerSight.frameLayers(perception), ...this.uiManager.getPlayerViewLayers(settings, isSeen), ...this.dragRuler.getPlayerViewLayers(isSeen), ...this.exit.playerViewLayers(),
      ...this.turnMarkers.playerLayers(seenByPlayers(mapTokens(levelObjects(state)), perception), turnShown), ...this.hiddenTurnLayers()];
  }

  /** The chevrons of a Shift-drag turn are the GM's alone: neither the players' frame nor a picture of the scene shows them. */
  private hiddenTurnLayers(): LayerVisibility[] {
    return this.interactionController.turnLayers().map((layer) => ({ layer, visible: false }));
  }

  /** How far a selected token's bars stand out from it, in world units. */
  public bars(tokenId: string): BarsSpan {
    return this.uiManager.bars(tokenId);
  }

  /** A token is being resized or turned, by its handles or with Shift. */
  public transforming(): boolean {
    return this.uiManager.transforming() || this.interactionController.isTurningTokens();
  }

  /** What can be done with the token and the selection it belongs to (`tokenActions`), for a menu at `at` in the window. */
  public tokenActions(tokenId: string, at: { x: number; y: number }): SelectionAction[] {
    return this.interactionController.tokenActions(tokenId, at);
  }

  /** What the ruler of the drag under way measures, or null while it shows none. */
  /** How the map's tokens move: its movement rules and each token's speed, as the drag ruler reads them. */
  public tokenMovement(): TokenMovement {
    return this.movement;
  }

  public dragRulerPath(): DragRulerPath | null {
    return this.dragRuler.path();
  }

  /** Tokens and their bars, nameplates and badges as the GM view shows them, whatever view the canvas is in: for a picture of the scene. */
  public getGmViewLayers(): LayerVisibility[] {
    return [...gmTokenLayers(mapTokens(levelObjects(this.store.getState())), this.tokenSprites), ...this.uiManager.getGmViewLayers(), ...this.playerSight.gmLayers(), ...this.turnMarkers.pictureLayers(), ...this.hiddenTurnLayers()];
  }

  /** The resource and condition definitions of the map's collection the tokens are drawn by. */
  public collectionRules(): Pick<TokenCollectionSync, 'resources' | 'conditions'> {
    return this.collectionSync;
  }

  /** Get all token sprites for external systems like SelectionManager. */
  public getTokenSprites(): Record<string, TokenGroupContainer> {
    return this.tokenSprites as Record<string, TokenGroupContainer>;
  }

  /** Applies a token sync that was deferred while the map was loading. */
  public forceSyncTokens(): void {
    this.syncService.forceSyncTokens();
  }

  /**
   * `token` drawn as it will look once placed, by the factory that draws placed tokens, for the GM's
   * hand (`TokenPlacer`). It holds its art until released.
   */
  public async previewToken(token: TokenInput): Promise<TokenPreview> {
    const art = token.imagePath;
    const texture = await this.textureCache.acquire(art);
    const group = await this.spriteFactory.createTokenSprite({ ...token, id: 'placement-preview', kind: token.kind ?? 'token' } as TokenEntity, texture);
    group.zIndex = 0;
    const ringScale = this.store.getState().tokenSettings?.tokenRingSize ?? 1;
    if (ringScale !== 1) this.spriteFactory.createTokenRing(group, token.ringColor || '#ffffff', group.tokenSize * ringScale);
    return {
      group,
      diameter: group.tokenSize,
      rotate: (degrees) => this.spriteFactory.updateTokenRotation(group, degrees),
      release: () => {
        this.spriteFactory.destroyTokenSprite(group);
        this.textureCache.release(art);
      },
    };
  }

  /**
   * The lighting decides which ways a token may be drawn on (`glideWayIsClear`): its sight and light
   * follow the token as it glides (`ShownPlaces`).
   */
  public setGlideWay(clearWay: (from: Point, to: Point) => boolean): void {
    this.glideWay = clearWay;
  }

  /**
   * How tokens someone else holds are drawn from now on: played out as the cursor of the pointer
   * holding them (a player's drag followed online), or, with null, glided to each place the store gives.
   */
  public setHeldPlayout(playout: HeldPlayout | null): void {
    this.heldPlayout = playout;
  }

  /** Who holds a token: this view's pointer while it drags tokens, else whoever the store notes it held by. */
  private heldBy(tokenId: string): TokenHolder {
    if (!this.store.getState().heldTokens[tokenId]) return null;
    return this.interactionController.isDraggingTokens() ? 'pointer' : 'elsewhere';
  }

  /** The lighting lays out the levels' maps (`ArtFloors`): a token dropped where it draws a level below falls there. */
  public setArtFloors(provider: () => ArtFloors | undefined): void {
    this.interactionController.setArtFloors(provider);
  }

  /** The map's size in world pixels: in session view it sets how wide walls stop a dragged token. */
  public setMapSize(read: () => { width: number; height: number } | null): void {
    this.interactionController.setMapSize(read);
  }

  /** Circle-collision hit test against all visible token sprites; in a pile the token drawn on top wins. */
  public hitTestTokens(worldX: number, worldY: number): string | null {
    const tokens = mapTokens(levelObjects(this.store.getState()));
    const gridSize = this.gridSystem.getOptions().size;
    const drawOrder = this.tokenContainer.children;
    let topId: string | null = null;
    let topIndex = -1;

    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      if (!tokenGroup || !tokenGroup.visible) continue;

      const token = tokens[id];
      if (!token) continue;

      const sizeMultiplier = token.size || 1;
      const tokenSize = computeTokenPixelSize(gridSize, sizeMultiplier);
      const radius = tokenSize / 2;

      const dx = worldX - tokenGroup.position.x;
      const dy = worldY - tokenGroup.position.y;
      if (dx * dx + dy * dy > radius * radius) continue;

      const index = drawOrder.indexOf(tokenGroup);
      if (index >= topIndex) {
        topId = id;
        topIndex = index;
      }
    }
    return topId;
  }

  /**
   * Gets the container holding all tokens
   */
  public getTokenContainer(): Container {
    return this.tokenContainer;
  }

  /**
   * Updates all token sizes (typically after grid change)
   */
  public updateAllTokenSizes(): void {
    const tokens = mapTokens(levelObjects(this.store.getState()));
    for (const [tokenId, token] of Object.entries(tokens)) {
      const tokenGroup = this.tokenSprites[tokenId];
      if (tokenGroup instanceof Container) {
        const size = token.size || 1;
        this.spriteFactory.updateTokenSize(tokenId, tokenGroup, size);
        
        // Calculate token size based on grid
        const tokenSize = computeTokenPixelSize(this.gridSystem.getOptions().size, size);
        
        // Update UI scale
        this.uiManager.syncUIScale(tokenId, tokenSize);
        
        // Always refresh ring, even when token has no explicit ringColor.
        const ringColor = token.ringColor;
        this.updateTokenRing(tokenId, tokenGroup, tokenSize, ringColor);
      }
    }

    // Refresh instance badges for all tokens (covers tokens without rings)
    this.refreshInstanceBadges();
  }

}
