import type { FogCoverage } from '../fog/fogCoverage';
import { StatblockTokenSync } from '../plugin/StatblockTokenSync';
import { TokenCollectionSync } from '../plugin/TokenCollectionSync';
import type { ResourceDefsProvider } from '../resources/resourceTypes';
import { fitTokenArtwork, syncTokenArtwork } from './token-renderer/tokenArtwork';
import type { AtlasSettings } from '../services/SettingsService';
import { HIDDEN_TOKEN_ALPHA, gmTokenLayers, type HideableLayer, type LayerVisibility } from './playerSafeFrame';
import type { TokenPerception } from './lighting/playerLightingLayers';
import { PlayerSightTokens, seenTokens } from './token-renderer/PlayerSightTokens';
import { Sprite, Container, Graphics, Application, FederatedPointerEvent } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { App as ObsidianApp } from 'obsidian';
import type { TokenEntity } from "../types";
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import type { GridSystem } from "../grid/GridSystem";
import { getDrawingBounds } from "./drawingGeometry";
import type { ViewAtlasStore } from '../storeFactory';
import { EventEmitter } from 'events';
import { AssetValidationService } from '../services/AssetValidationService';
import { TokenStatblockLinkService } from '../services/TokenStatblockLinkService';
import { SpriteFactory } from './token-renderer/SpriteFactory';
import { computeTokenPixelSize } from './token-renderer/tokenSizing';
import { TextureCache } from './token-renderer/TextureCache';
import { UIManager } from './token-renderer/UIManager';
import { InteractionController } from './token-renderer/InteractionController';
import { DragRuler } from './token-renderer/DragRuler';
import { DragRulerView } from './token-renderer/DragRulerView';
import { SyncService } from './token-renderer/SyncService';
import { createSceneSource } from '../plugin/host/sceneSource';
import { updateInstanceBadge } from './token-renderer/InstanceBadge';
import { HiddenTokenIcon } from './token-renderer/HiddenTokenIcon';
import { DownedTokenOverlay } from './token-renderer/DownedTokenOverlay';
import { isTokenDowned } from './token-renderer/isTokenDowned';
import { requestRender } from './RenderScheduler';
import { normalizeImagePath } from '../utils/pathUtils';
import { prefersReducedMotion } from '../utils/motion';
import { destroyTree } from './utils/destroyTree';
import type { TokenGroupContainer } from './token-renderer/types';
import { setCanvasCursor } from './utils/canvasCursor';
import { markHandled, resetHandled } from './utils/handledEvents';
import { watchClick } from './utils/clickRelease';
import type { HexLinkPointerHandlers } from './hexLinks/HexLinkInteraction';
import type { LightPointerHandlers } from './lighting/LightInteraction';
import { runInBackground } from '../utils/backgroundTask';
import { isModHeld } from '../keyboard/modKey';

/** What the lighting controller answers about a right-click on a door's badge. */
export interface DoorMenuHandlers {
  /** The door whose badge is at the world point, while badges show. */
  hitTest: (worldX: number, worldY: number) => string | null;
  open: (doorId: string, screenX: number, screenY: number) => void;
}

export class TokenRenderer {
  private obsApp: ObsidianApp;
  private viewport: Viewport;
  private gridSystem: GridSystem;
  private tokenContainer: Container;
  private tokenSprites: Record<string, TokenGroupContainer | null> = {};
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
  private readonly hiddenTokenIcon = new HiddenTokenIcon();
  private readonly downedTokenOverlay = new DownedTokenOverlay(
    () => {
      if (this.pixiApp) requestRender(this.pixiApp);
    },
    () => this.pixiApp?.ticker ?? null,
  );
  private uiManager: UIManager;
  private interactionController: InteractionController;
  private dragRuler: DragRuler;
  private syncService: SyncService;
  
  
  // Batch sorting optimization
  private sortPending: boolean = false;
  private sortTimeout: number | null = null;
  
  // Store reference to PIXI app for renderer access
  private pixiApp: Application | null = null;
  
  // Track loading tokens
  private tokensLoading: Set<string> = new Set();
  /** Bumped on every map load; sprites that finish loading for an earlier one are discarded. */
  private mapLoadGeneration = 0;
  private allTokensLoadedCallbacks: Array<() => void> = [];
  private viewId: string;
  private themeObserver: MutationObserver | null = null;
  private isLocalPlayerMode: boolean = false;
  private isDestroyed = false;

  // Store event handlers for proper cleanup
  private _handleGridTypeChange?: EventListener;
  private _handleRotationUpdate?: (event: CustomEvent<TokenGestureEventDetail>) => void;
  private _handleResizeUpdate?: (event: CustomEvent<TokenGestureEventDetail>) => void;
  private _handleRotationEnded?: EventListener;
  private _handleResizeEnded?: EventListener;

  // Fog provider pattern — wired by PixiRendererOrchestrator
  private fogHitTestProvider?: (worldX: number, worldY: number) => string | null;
  private fogClickHandler?: (fogId: string, e: FederatedPointerEvent) => void;
  private drawingHitTestProvider?: (worldX: number, worldY: number) => string | null;
  private drawingClickHandler?: (drawingId: string, e: FederatedPointerEvent) => void;
  private drawingDragStartHandler?: (e: FederatedPointerEvent) => void;

  // Pin provider pattern — wired by PixiRendererOrchestrator
  private pinHitTestProvider?: (worldX: number, worldY: number) => string | null;
  private pinClickHandler?: (pinId: string, e: FederatedPointerEvent) => void;
  private pinHoverHandler?: (type: 'over' | 'out', pinId: string, e?: FederatedPointerEvent) => void;
  private hexLinkHandlers?: HexLinkPointerHandlers;
  /** Ends the watch on a right press that opens a hex or fog menu on release. */
  private stopMenuPress?: () => void;
  private doorClickHandler?: (worldX: number, worldY: number) => boolean;
  /** A right-click on a door's badge, with any tool but the lighting tool, whose own menu has the door's entries. */
  private doorMenuHandlers?: DoorMenuHandlers;
  /** The tokens as the players' sight shows them: which are left out, and the outlines of sensed ones. */
  private readonly playerSight = new PlayerSightTokens({ tokens: () => this.store.getState().objects.tokens, sprites: () => this.tokenSprites, held: () => this.heldTokenIds });
  private lightHandlers?: LightPointerHandlers;
  /** Tokens held by the pointer; lighting alone does not hide them until release. */
  private heldTokenIds: ReadonlySet<string> = new Set();
  private lastHoveredPinId: string | null = null;

  // Wall provider pattern — wired by PixiRendererOrchestrator
  private wallPointerDownHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean;
  private wallPointerMoveHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => void;
  private wallPointerUpHandler?: () => void;
  private wallDoubleClickHandler?: () => void;
  private wallContextMenuHandler?: (worldX: number, worldY: number, screenX: number, screenY: number) => void;
  private wallCursorProvider?: (worldX: number, worldY: number) => string;

  // Audio provider pattern — wired by PixiRendererOrchestrator
  private audioPointerDownHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean;
  private audioPointerMoveHandler?: (worldX: number, worldY: number, e: FederatedPointerEvent) => void;

  constructor(
    obsApp: ObsidianApp,
    viewport: Viewport,
    gridSystem: GridSystem,
    selectionOverlayUpdater: () => void,
    store: ViewAtlasStore,
    eventBus: EventEmitter,
    viewId?: string
  ) {
    this.obsApp = obsApp;
    this.viewport = viewport;
    this.gridSystem = gridSystem;
    this.selectionOverlayUpdater = selectionOverlayUpdater;
    this.store = store;
    this.eventBus = eventBus;
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

    // Initialize texture cache
    this.textureCache = new TextureCache(this.obsApp);

    // Initialize UI manager
    this.uiManager = new UIManager(this.viewport, this.store, this.viewId, isPlayerView);
    
    // Provide token sprite access to UI manager
    this.uiManager.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    
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
    this.interactionController.setUIPositionUpdater((tokenId: string, x: number, y: number) => {
      this.uiManager.syncUIPosition(tokenId, x, y);
      this.refreshDisplayedToken(tokenId);
    });
    this.interactionController.setControlsPositionUpdater((x: number, y: number, tokenSize: number) =>
      this.uiManager.updateControlsPosition(x, y, tokenSize)
    );
    this.interactionController.setHandlePositionUpdater(() => 
      this.uiManager.updateHandlePositions()
    );
    this.interactionController.setTokensHeldCallback((tokenIds) => {
      this.uiManager.setTokensHeld(tokenIds);
      this.heldTokenIds = new Set(tokenIds);
      // A token released out of the players' sight now follows it.
      this.refreshPlayerSight();
    });
    this.interactionController.setSelectionUpdateCallback(() => {
      if (typeof this.selectionOverlayUpdater === 'function') {
        this.selectionOverlayUpdater();
      }
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
    this.statblockSync = new StatblockTokenSync(obsApp, store, tokenStatblockLinkService, this.resourceDefsProvider);

    // Initialize sync service
    this.syncService = new SyncService(
      createSceneSource(this.store, state => ({
        tokens: state.objects.tokens,
        isMapLoading: state.isMapLoading,
        selectedIds: state.selectedIds,
      })),
      (tokenId, x, y) => this.store.getState().moveToken(tokenId, x, y),
      this.eventBus,
    );
    
    // Set up sync service callbacks
    this.syncService.setTokenSpriteProvider((tokenId: string) => this.tokenSprites[tokenId] || null);
    this.syncService.setUIPositionUpdater((tokenId: string, x: number, y: number) => {
      this.uiManager.syncUIPosition(tokenId, x, y);
      this.refreshDisplayedToken(tokenId);
    });
    this.syncService.setControlsPositionUpdater((x: number, y: number, tokenSize: number) =>
      this.uiManager.updateControlsPosition(x, y, tokenSize)
    );
    this.syncService.setTokensChangedCallback((newTokens, prevTokens) =>
      runInBackground(this.syncTokens(newTokens, prevTokens), 'Token sync')
    );
    this.syncService.setAnimationStartCallback((tokenId: string) => {
      // Could add visual feedback for animation start
    });
    this.syncService.setAnimationEndCallback((tokenId: string) => {
      // Could add visual feedback for animation end
    });

    this.tokenContainer = new Container();
    this.tokenContainer.label = 'tokenContainer';
    this.tokenContainer.sortableChildren = true;
    this.tokenContainer.eventMode = 'passive';
    this.tokenContainer.interactiveChildren = true;
    this.tokenContainer.zIndex = 0;
    this.viewport.addChild(this.tokenContainer);
    this.viewport.addChild(this.playerSight.outlineLayer);

    this.dragRuler = new DragRuler(
      new DragRulerView(this.viewport, this.tokenContainer),
      this.gridSystem,
      this.store,
      this.collectionSync.measurement,
      (id) => this.tokenSprites[id]?.visible ?? false,
    );
    this.interactionController.setDragRuler(this.dragRuler);

    // Initialize sync service
    this.syncService.initialize();

    // Set up viewport-level event handlers for token hit testing
    this.setupViewportEventHandlers();
    
    // Only sync tokens if we have a valid map path
    // This prevents syncing with stale tokens from previous maps
    const currentMapPath = this.store.getState().mapPath;
    if (currentMapPath) {
      runInBackground(this.syncTokens(this.store.getState().objects.tokens, {}), 'Initial token sync');
      // Ensure all existing tokens (including ones without explicit ringColor)
      // get their ring rebuilt with the current renderer implementation.
      this.onWhenAllTokensLoaded(() => this.updateAllTokenSizes());
    }
    
    
    // Set up theme observer
    this.setupThemeObserver();
    
    
    
    // Listen for player mode changes (local player view toggle)
    const handlePlayerModeChange = (isPlayerMode: boolean) => {
      this.isLocalPlayerMode = isPlayerMode;
      this.refreshPlayerSight();
    };
    
    this.eventBus.on('player-mode-changed', handlePlayerModeChange);

    // Fog and perspective changes affect presentation even when no token or light changed.
    const gmViewUnsubscribe = this.store.subscribe((state, previous) => {
      if (state.isGMView !== previous.isGMView || state.isPlayerView !== previous.isPlayerView ||
          state.objects.fog !== previous.objects.fog || state.mapPath !== previous.mapPath ||
          state.isMapLoading !== previous.isMapLoading) this.refreshPlayerSight();
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
    const handleMapLoaded = () => {
      // Sprites still loading belong to the previous load and are discarded when they finish
      this.mapLoadGeneration++;
      this.tokensLoading = new Set();

      // First, clear all existing token sprites (tokenSprites is an object, not a Map)
      for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
        if (tokenGroup) this.destroyTokenGroup(id, tokenGroup);
      }
      this.tokenSprites = {};
      
      // Also clear token rings
      this.tokenRings = {};
      
      // Clear only token-specific UI elements, not the singleton controls
      // This preserves TokenControlsUI, TokenRotationUI, and TokenResizeUI
      this.uiManager.destroyAllTokenUIs();
      
      // Clear selection to ensure controls are hidden
      this.store.getState().clearSelection();
      
      // Then sync with the new map's tokens, keeping only their art decoded
      const currentTokens = this.store.getState().objects.tokens;
      this.evictUnusedArt();
      runInBackground(this.syncTokens(currentTokens, {}), 'Token sync after map change');
      this.onWhenAllTokensLoaded(() => this.updateAllTokenSizes());
      this.fillMissingResources();
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
      const tokens = this.store.getState().objects.tokens;

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
    });

    window.addEventListener('atlas-token-rotation-ended', this._handleRotationEnded);
    window.addEventListener('atlas-token-resize-ended', this._handleResizeEnded);
    
    // Listen for resize updates during drag
    this._handleResizeUpdate = (event): void => {
      const tokenIds = event.detail?.tokenIds || [];
      const tokens = this.store.getState().objects.tokens;

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
      // Clean up player mode listener
      this.eventBus.off('player-mode-changed', handlePlayerModeChange);
      // Clean up map load listeners
      this.eventBus.off('map-loaded', handleMapLoaded);
      // Clean up metadata change listener
      this.statblockSync.destroy();
      this.collectionSync.destroy();
    };
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

  private syncUIPosition(tokenId: string, x: number, y: number): void {
    this.uiManager.syncUIPosition(tokenId, x, y);
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
    const current = this.store.getState().objects.tokens[tokenId];
    if (current) tokenGroup.tokenData = current;
    const sizeWithMultiplier = size * (this.store.getState().tokenSettings?.tokenRingSize ?? 1);
    const resolvedRingColor = ringColor || '#ffffff';

    // Route all ring redraws through SpriteFactory to keep visuals consistent
    // between initial create and subsequent updates (size/color changes).
    const ring = this.spriteFactory.createTokenRing(tokenGroup, resolvedRingColor, sizeWithMultiplier);
    syncTokenArtwork(tokenGroup, size);
    this.downedTokenOverlay.refresh(tokenGroup);
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
    const tokens = Object.values(this.store.getState().objects.tokens);
    const countByImage = new Map<string, number>();
    for (const token of tokens) {
      countByImage.set(token.imagePath, (countByImage.get(token.imagePath) ?? 0) + 1);
    }

    for (const token of tokens) {
      const tokenGroup = this.tokenSprites[token.id];
      if (tokenGroup) this.drawInstanceBadge(token, tokenGroup, countByImage.get(token.imagePath) ?? 0);
    }
  }

  /** Draws the badge of a single token, e.g. one whose sprite finished loading after the last sync. */
  private refreshInstanceBadge(tokenId: string): void {
    const token = this.store.getState().objects.tokens[tokenId];
    const tokenGroup = this.tokenSprites[tokenId];
    if (token && tokenGroup) this.drawInstanceBadge(token, tokenGroup, this.countTokensWithImage(token.imagePath));
  }

  private countTokensWithImage(imagePath: string): number {
    const tokens = Object.values(this.store.getState().objects.tokens);
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

  private isInPlayerMode(): boolean {
    const isPlayerView = this.store.getState().isPlayerView || false;
    const isGMView = this.store.getState().isGMView;
    return this.isLocalPlayerMode || isPlayerView || !isGMView;
  }

  /** Whether the canvas leaves `token` out: a hidden one in the players' perspective, and one the players' sight leaves out. */
  private hidesToken(token: TokenEntity, perception = this.playerSight.perception()): boolean {
    return ((token.isHidden ?? false) && this.isInPlayerMode()) || this.playerSight.hides(token.id, perception);
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

  /** Greys out a token at 0 HP and marks it with a skull; killing and healing a loaded token animate. */
  private applyDownedState(token: TokenEntity, tokenGroup: TokenGroupContainer, prevToken?: TokenEntity): void {
    const definitions = this.resourceDefsProvider();
    const downed = isTokenDowned(token, definitions);
    const canvas = this.pixiApp?.canvas;
    const animate = prevToken !== undefined && isTokenDowned(prevToken, definitions) !== downed && !!canvas && !prefersReducedMotion(canvas);
    this.downedTokenOverlay.update(tokenGroup, downed, animate);
  }

  /** How the players perceive each token while this canvas shows their view of a lit scene (`PlayerSightTokens.setProvider`). */
  public setPlayerSightProvider(provider: () => TokenPerception | undefined, active?: () => boolean): void {
    this.playerSight.setProvider(provider, active);
  }

  /** Shares the committed coverage with the fog renderer, independently of lighting. */
  public setFogCoverageProvider(provider: () => FogCoverage | null): void {
    this.playerSight.setFogProvider(provider, () => this.isInPlayerMode());
    this.refreshPlayerSight();
  }

  /** Movement can lead the store; apply fog before the displayed position is rendered. */
  private refreshDisplayedToken(tokenId: string): void {
    const token = this.store.getState().objects.tokens[tokenId];
    const sprite = this.tokenSprites[tokenId];
    const perception = this.playerSight.perception();
    if (!token || !sprite || !perception) return;
    this.applyTokenVisibilityPolicy(token, sprite, token, perception);
    this.playerSight.syncOutline(tokenId, perception);
  }

  /** The tokens the canvas shows: those a selection may take. */
  public visibleTokenIds(): string[] {
    return Object.entries(this.tokenSprites).filter(([, tokenGroup]) => tokenGroup?.visible).map(([id]) => id);
  }

  /** The players' sight changed, or whether the canvas shows it: tokens entering or leaving it show or hide. */
  public refreshPlayerSight(): void {
    const tokens = this.store.getState().objects.tokens;
    const perception = this.playerSight.perception();
    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      const token = tokens[id];
      if (!token || !tokenGroup || tokenGroup.visible !== this.hidesToken(token, perception)) continue;
      this.applyTokenVisibilityPolicy(token, tokenGroup, token, perception);
    }
    this.playerSight.syncOutlines(perception);
    this.dragRuler.refreshVisibility();
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

    // Handle deleted tokens
    for (const id of deletedTokenIds) {
      const tokenGroup = this.tokenSprites[id];

      if (tokenGroup) {
        this.destroyTokenGroup(id, tokenGroup);
        delete this.tokenSprites[id];
        // Clean up ring tracking (ring is destroyed with tokenGroup)
        delete this.tokenRings[id];
        // Clean up token UI
        this.uiManager.destroyTokenUI(id);
      }
    }
    if (deletedTokenIds.size > 0) this.evictUnusedArt();

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
          // Don't update position if token is animating - let animation complete naturally
          if (!this.syncService.isTokenAnimating(token.id)) {
            // Cancel any ongoing animation for this token to ensure store position takes precedence
            this.syncService.cancelAnimation(token.id);
            existingTokenGroup.position.set(token.x, token.y);
            this.uiManager.syncUIPosition(token.id, token.x, token.y);
          }
          
          // Update rotation handle positions when token moves
          this.uiManager.updateHandlePositions();
        }
        
        // Update rotation if it changed or if there's a temporary rotation
        const tempRotation = this.uiManager.getRotationUI()?.getTemporaryRotation(token.id);
        const displayRotation = tempRotation !== undefined ? tempRotation : (token.rotation || 0);
        this.spriteFactory.updateTokenRotation(existingTokenGroup, displayRotation);
        
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
        
        // Update z-index if layer changed
        if (!prevToken || prevToken.layer !== token.layer) {
          existingTokenGroup.zIndex = token.layer || 0;
          this.requestSort();
        }
        
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

          // Another map loaded meanwhile (possibly this one again, with its own load of this
          // token), so this sprite must neither show nor touch the new load's state.
          if (this.isStaleLoad(generation)) {
            this.destroyTokenGroup(token.id, tokenGroup);
            this.evictUnusedArt();
            return;
          }

          // Syncs skip tokens whose sprite is still loading, so check what happened meanwhile.
          const latest = this.store.getState().objects.tokens[token.id];
          if (!latest) {
            // Removed while loading, e.g. a paste undone straight away: never show it.
            this.destroyTokenGroup(token.id, tokenGroup);
            this.evictUnusedArt();
            delete this.tokenSprites[token.id];
            this.tokensLoading.delete(token.id);
            this.checkAllTokensLoaded();
            return;
          }

          // Set up interaction handlers
          this.interactionController.attachInteractionHandlers(token.id, tokenGroup, token);
          
          // Add to container
          container.addChild(tokenGroup);
          
          // Store sprite reference
          this.tokenSprites[token.id] = tokenGroup;

          // The sync that added this token refreshed badges before its sprite existed
          this.refreshInstanceBadge(token.id);

          // Remove from loading set
          this.tokensLoading.delete(token.id);
          
          // Check if all tokens are loaded
          this.checkAllTokensLoaded();
          
          // Create UI elements
          this.uiManager.createTokenUI(token.id, tokenGroup, character);
          
          this.applyTokenVisibilityPolicy(character, tokenGroup);
          this.applyDownedState(character, tokenGroup);
          
          // Request sort for proper z-ordering
          this.requestSort();
          
          // Also ensure viewport sorts its children to maintain UI above tokens
          this.viewport.sortChildren();

          // Changes made while loading (an Alt-drag copy moving, a pasted token rotated) go
          // through the regular update path, diffed against the state the sprite was built from.
          if (latest !== token) {
            const current = this.store.getState().objects.tokens;
            runInBackground(this.syncTokens(current, { ...current, [token.id]: token }), 'Token sync after sprite load');
          }
        } catch (error) {
          console.error(`[TokenRenderer] Failed to create sprite for token ${token.id}:`, error);
          // Undo what this load built: its group, which holds the art, or just the hold
          if (tokenGroup) this.destroyTokenGroup(token.id, tokenGroup);
          else if (heldArt !== null) this.textureCache.release(heldArt);
          if (this.isStaleLoad(generation)) return;
          delete this.tokenSprites[token.id];
          this.uiManager.destroyTokenUI(token.id);
          this.tokensLoading.delete(token.id);
          this.checkAllTokensLoaded();
        }
      })();
    }

    // Update instance badges for all tokens after any changes
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

  /** Detaches a token group's pointer handlers, destroys it with all of its children and drops its hold on its art. */
  private destroyTokenGroup(id: string, tokenGroup: TokenGroupContainer): void {
    this.interactionController.removeInteractionHandlers(id, tokenGroup);
    this.downedTokenOverlay.release(tokenGroup);
    this.spriteFactory.destroyTokenSprite(tokenGroup);
    this.textureCache.release(tokenGroup.artPath);
  }

  /** Whether a sprite load started for map load `generation` finished after a newer load or destroy. */
  private isStaleLoad(generation: number): boolean {
    return this.isDestroyed || generation !== this.mapLoadGeneration;
  }

  /** Frees decoded art no token holds, keeping the art of every token on the map. */
  private evictUnusedArt(): void {
    const tokens = Object.values(this.store.getState().objects.tokens);
    this.textureCache.evictUnused(tokens.map((token) => token.imagePath ?? ''));
  }

  public destroy(): void {
    this.isDestroyed = true;

    // Unsubscribe from store
    this._unsubscribeFromStore?.();
    this._unsubscribeFromViewport?.();
    this.stopMenuPress?.();
    
    // Clean up sync service
    this.syncService.destroyAll();
    
    // Clear any pending sort
    if (this.sortTimeout !== null) {
      window.clearTimeout(this.sortTimeout);
      this.sortTimeout = null;
    }
    
    // Clean up all sprites first
    for (const [id, tokenGroup] of Object.entries(this.tokenSprites)) {
      if (tokenGroup && tokenGroup !== null) {
        // Remove interaction handlers through InteractionController
        this.interactionController.removeInteractionHandlers(id, tokenGroup);
        
        // Remove all event listeners from the tokenGroup
        tokenGroup.removeAllListeners();
      }
    }
    
    // Remove viewport handlers owned by TokenRenderer.
    this.viewport.off('pointerdown', this.onViewportPointerDown);
    this.viewport.off('pointermove', this.onViewportPointerMove);
    this.viewport.off('pointerup', this.onViewportPointerUp, this);
    this.viewport.off('pointerupoutside', this.onViewportPointerUp, this);
    this.setCanvasListeners(false);
    
    // Destroy all UI elements through UIManager
    this.uiManager.destroyAll();
    
    // Destroy interaction controller
    this.interactionController.destroyAll();
    this.dragRuler.destroy();
    this.playerSight.destroy();
    
    // Clean up theme observer
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    
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

  /** Redraws what tokens show of their collection's rules (conditions, resources) and starts the resources they lack. */
  private refreshCollectionRules(): void {
    if (this.isDestroyed) return;
    this.uiManager.refreshConditions();
    this.uiManager.refreshResources();
    this.fillMissingResources();
  }

  private fillMissingResources(): void {
    this.statblockSync.fillMissingResources();
  }

  /**
   * Setup theme observer to update UI when theme changes
   */
  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme changed, update rotation and resize handles
          this.uiManager.getRotationUI()?.updateTheme();
          this.uiManager.getResizeUI()?.updateTheme();
        }
      }
    });
    
    // Start observing
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
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
    
    const tokens = currentState.objects.tokens;
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
        // Update sprite position immediately for visual feedback
        tokenSprite.position.set(snappedPos.x, snappedPos.y);
        this.uiManager.syncUIPosition(tokenId, snappedPos.x, snappedPos.y);
        tokenUpdates.push({id: tokenId, x: snappedPos.x, y: snappedPos.y});
      }
    }
    
    // Bulk update positions in store if any tokens moved
    if (tokenUpdates.length > 0) {
      this.store.getState().setTokenPositions(tokenUpdates);
    }
  }

  /**
   * Provides PIXI app reference to sync service when available
   */
  public setPixiApp(app: Application | null): void {
    this.setCanvasListeners(false);
    this.pixiApp = app;
    this.setCanvasListeners(true);
    this.syncService.setPixiApp(app);
    if (app) {
      this.textureCache.setPixiApp(app);
    }
  }

  /** Player overlays prepared for the next mirrored frame; `perception` leaves out what the players do not see and outlines what they only sense. */
  public getPlayerViewLayers(settings: AtlasSettings['localPlayerView'], perception?: TokenPerception): LayerVisibility[] {
    perception = this.playerSight.framePerception(perception);
    const isSeen = seenTokens(perception);
    return [...this.playerSight.frameLayers(perception), ...this.uiManager.getPlayerViewLayers(settings, isSeen), ...this.dragRuler.getPlayerViewLayers(isSeen)];
  }

  /** How far a selected token's resources reach beyond its bottom, right and top edges, in world units. */
  public barsReach(tokenId: string): number {
    return this.uiManager.barsReach(tokenId);
  }

  /** Tokens and their bars and nameplates as the GM view shows them, whatever view the canvas is in: for a picture of the scene. */
  public getGmViewLayers(): LayerVisibility[] {
    return [...gmTokenLayers(this.store.getState().objects.tokens, this.tokenSprites), ...this.uiManager.getGmViewLayers(), ...this.playerSight.gmLayers()];
  }

  /** Get all token sprites for external systems like SelectionManager. */
  public getTokenSprites(): Record<string, TokenGroupContainer> {
    return this.tokenSprites as Record<string, TokenGroupContainer>;
  }

  /** Applies a token sync that was deferred while the map was loading. */
  public forceSyncTokens(): void {
    this.syncService.forceSyncTokens();
  }

  // ─── Fog provider setters ───────────────────────────────────────────

  public setFogHitTestProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.fogHitTestProvider = fn;
  }

  public setFogClickHandler(fn: (fogId: string, e: FederatedPointerEvent) => void): void {
    this.fogClickHandler = fn;
  }

  public setDrawingHitTestProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.drawingHitTestProvider = fn;
  }

  public setDrawingClickHandler(fn: (drawingId: string, e: FederatedPointerEvent) => void): void {
    this.drawingClickHandler = fn;
  }

  /** Called when a group drag starts, so selected drawings follow the tokens. */
  public setDrawingDragStartHandler(fn: (e: FederatedPointerEvent) => void): void {
    this.drawingDragStartHandler = fn;
  }

  public setPinHitTestProvider(fn: (worldX: number, worldY: number) => string | null): void {
    this.pinHitTestProvider = fn;
  }

  public setPinClickHandler(fn: (pinId: string, e: FederatedPointerEvent) => void): void {
    this.pinClickHandler = fn;
  }

  public setPinHoverHandler(fn: (type: 'over' | 'out', pinId: string, e?: FederatedPointerEvent) => void): void {
    this.pinHoverHandler = fn;
  }

  /** Notes linked to hexes: they react to the select and move tools, below tokens and drawings. */
  public setHexLinkHandlers(handlers: HexLinkPointerHandlers): void {
    this.hexLinkHandlers = handlers;
  }

  /** Door badges: the GM opens and closes doors with a click from any tool but the wall tool, which edits them. */
  /** Placed lights: their markers and range rings take the pointer with any tool, after pins and door badges. */
  public setLightHandlers(handlers: LightPointerHandlers): void {
    this.lightHandlers = handlers;
  }

  public setDoorClickHandler(handler: (worldX: number, worldY: number) => boolean): void {
    this.doorClickHandler = handler;
  }

  public setDoorMenuHandlers(handlers: DoorMenuHandlers): void {
    this.doorMenuHandlers = handlers;
  }

  public setWallPointerDownHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean): void {
    this.wallPointerDownHandler = fn;
  }

  public setWallPointerMoveHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => void): void {
    this.wallPointerMoveHandler = fn;
  }

  public setWallPointerUpHandler(fn: () => void): void {
    this.wallPointerUpHandler = fn;
  }

  public setWallDoubleClickHandler(fn: () => void): void {
    this.wallDoubleClickHandler = fn;
  }

  public setWallContextMenuHandler(fn: (worldX: number, worldY: number, screenX: number, screenY: number) => void): void {
    this.wallContextMenuHandler = fn;
  }

  public setWallCursorProvider(fn: (worldX: number, worldY: number) => string): void {
    this.wallCursorProvider = fn;
  }

  /** The view's lighting is gone: nothing takes the pointer for lights, walls and doors any more, and no sight hides tokens. */
  public clearLighting(): void {
    delete this.lightHandlers;
    delete this.doorClickHandler;
    delete this.doorMenuHandlers;
    delete this.wallPointerDownHandler;
    delete this.wallPointerMoveHandler;
    delete this.wallPointerUpHandler;
    delete this.wallDoubleClickHandler;
    delete this.wallContextMenuHandler;
    delete this.wallCursorProvider;
    this.playerSight.setProvider(() => undefined);
    this.refreshPlayerSight();
  }

  public setAudioPointerDownHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => boolean): void {
    this.audioPointerDownHandler = fn;
  }

  public setAudioPointerMoveHandler(fn: (worldX: number, worldY: number, e: FederatedPointerEvent) => void): void {
    this.audioPointerMoveHandler = fn;
  }

  // ─── Viewport-level event dispatch ──────────────────────────────────

  /** Circle-collision hit test against all visible token sprites; in a pile the token drawn on top wins. */
  public hitTestTokens(worldX: number, worldY: number): string | null {
    const tokens = this.store.getState().objects.tokens;
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

  /** Returns true if (worldX, worldY) is within the bounding box of the given selected tokens. */
  /** Drag the selected tokens; a no-op when the selection holds none. */
  private startTokenGroupDrag(e: FederatedPointerEvent): void {
    const { selectedIds, objects } = this.store.getState();
    const tokenIds = selectedIds.filter((id) => objects.tokens[id]);
    if (tokenIds.length > 0) this.interactionController.handleViewportGroupDragStart(tokenIds, e);
  }

  /** Drag the whole selection, tokens and drawings alike. */
  private startGroupDrag(e: FederatedPointerEvent): void {
    e.stopPropagation();
    this.startTokenGroupDrag(e);
    this.drawingDragStartHandler?.(e);
  }

  private isPointInSelectionBounds(worldX: number, worldY: number, selectedIds: string[]): boolean {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;
    const drawings = this.store.getState().objects.drawings;

    for (const id of selectedIds) {
      const drawing = drawings[id];
      const drawingBounds = drawing && getDrawingBounds(drawing);
      if (drawingBounds) {
        minX = Math.min(minX, drawingBounds.x);
        minY = Math.min(minY, drawingBounds.y);
        maxX = Math.max(maxX, drawingBounds.x + drawingBounds.width);
        maxY = Math.max(maxY, drawingBounds.y + drawingBounds.height);
        found = true;
        continue;
      }

      const tokenGroup = this.tokenSprites[id];
      if (!tokenGroup || !tokenGroup.visible) continue;

      // Match SelectionManager.updateSelectionOverlay bounds calculation:
      // use actual sprite dimensions, not grid size
      const sprite = tokenGroup.children[0];
      if (!sprite || !('width' in sprite)) continue;

      const halfW = sprite.width / 2;
      const halfH = sprite.height / 2;
      const x = tokenGroup.position.x;
      const y = tokenGroup.position.y;

      if (x - halfW < minX) minX = x - halfW;
      if (y - halfH < minY) minY = y - halfH;
      if (x + halfW > maxX) maxX = x + halfW;
      if (y + halfH > maxY) maxY = y + halfH;
      found = true;
    }

    if (!found) return false;

    // Same 12px padding as the selection overlay
    const pad = 12;
    return worldX >= minX - pad && worldX <= maxX + pad &&
           worldY >= minY - pad && worldY <= maxY + pad;
  }

  /** Set up viewport-level pointer handlers. Called once during init. */
  public setupViewportEventHandlers(): void {
    this.viewport.on('pointerdown', this.onViewportPointerDown);
    this.viewport.on('pointermove', this.onViewportPointerMove);
    this.viewport.on('pointerup', this.onViewportPointerUp, this);
    this.viewport.on('pointerupoutside', this.onViewportPointerUp, this);
  }

  /** DOM listeners on the canvas, which only exists once the PIXI app is set. */
  private setCanvasListeners(attach: boolean): void {
    const canvas = this.pixiApp?.canvas;
    if (!canvas) return;
    if (attach) {
      canvas.addEventListener('dblclick', this.onCanvasDoubleClick);
      canvas.addEventListener('pointerleave', this.onCanvasPointerLeave);
    } else {
      canvas.removeEventListener('dblclick', this.onCanvasDoubleClick);
      canvas.removeEventListener('pointerleave', this.onCanvasPointerLeave);
    }
  }

  private openMenuOnRelease(down: FederatedPointerEvent, open: (up: FederatedPointerEvent) => void): void {
    this.stopMenuPress?.();
    this.stopMenuPress = watchClick(this.viewport, down, open);
  }

  private onViewportPointerDown = (e: FederatedPointerEvent): void => {
    // PIXI v8 reuses FederatedPointerEvent objects — clear custom flags from previous events
    resetHandled(e);

    const activeTool = this.store.getState().activeTool;
    const worldPos = this.viewport.toWorld(e.global);

    // ── Right-click: check walls, fog, and pins ─────────────────────────
    if (e.button === 2) {
      // Wall context menu (when wall tool is active). It also opens beside the walls, for the selection,
      // so like the area menus below it waits for a release in place and a right-drag pans.
      if (activeTool === 'wall' && this.wallContextMenuHandler) {
        this.openMenuOnRelease(e, (up) => this.wallContextMenuHandler?.(worldPos.x, worldPos.y, up.clientX, up.clientY));
        return;
      }

      // A door's badge lies above pins and tokens: its menu opens on a release in place.
      const doorId = this.doorMenuHandlers?.hitTest(worldPos.x, worldPos.y);
      if (doorId) {
        this.openMenuOnRelease(e, (up) => this.doorMenuHandlers?.open(doorId, up.clientX, up.clientY));
        return;
      }

      // Check pins first (smaller hit targets, higher priority for right-click)
      if (this.pinHitTestProvider && this.pinClickHandler) {
        const pinId = this.pinHitTestProvider(worldPos.x, worldPos.y);
        if (pinId) {
          markHandled(e);
          this.pinClickHandler(pinId, e);
          return;
        }
      }
      // A token takes the right-click from a linked hex or fog beneath it, as it takes the left-click
      const tokenTools = activeTool === 'select' || activeTool === 'move';
      const onToken = tokenTools && this.hitTestTokens(worldPos.x, worldPos.y) !== null;
      // Linked hexes and fog cover whole stretches of the map: their press stays unhandled, so a
      // right-drag still pans, and the menu opens when the button is released in place
      if (tokenTools && !onToken && this.hexLinkHandlers) {
        const hexLinkId = this.hexLinkHandlers.hitTest(worldPos.x, worldPos.y);
        if (hexLinkId) {
          this.openMenuOnRelease(e, (up) => this.hexLinkHandlers?.openContextMenu(hexLinkId, up));
          return;
        }
      }
      if (!onToken && this.fogHitTestProvider && this.fogClickHandler) {
        const fogId = this.fogHitTestProvider(worldPos.x, worldPos.y);
        if (fogId) {
          this.openMenuOnRelease(e, (up) => this.fogClickHandler?.(fogId, up));
          return;
        }
      }
    }

    // ── Pin left-click: works from any tool (drag + open) ──────────────
    if (e.button === 0 && this.pinHitTestProvider && this.pinClickHandler) {
      const pinId = this.pinHitTestProvider(worldPos.x, worldPos.y);
      if (pinId) {
        markHandled(e);
        this.pinClickHandler(pinId, e);
        return;
      }
    }

    // ── Door badges: open and close doors from any tool ────────────────
    if (e.button === 0 && activeTool !== 'wall' && this.doorClickHandler?.(worldPos.x, worldPos.y)) {
      markHandled(e);
      return;
    }

    // ── Light markers and range rings: a light's popover and its drags, from any tool ──
    if (e.button === 0 && this.lightHandlers?.pointerDown(worldPos.x, worldPos.y, e)) {
      markHandled(e);
      return;
    }

    // ── Wall tool: drawing, vertex drag, selection ─────────────────────
    if (activeTool === 'wall' && e.button === 0 && this.wallPointerDownHandler) {
      const handled = this.wallPointerDownHandler(worldPos.x, worldPos.y, e);
      if (handled) {
        markHandled(e);
        return;
      }
    }

    // Audio tool: click to place or select audio sources
    if (activeTool === 'audio' && e.button === 0 && this.audioPointerDownHandler) {
      const handled = this.audioPointerDownHandler(worldPos.x, worldPos.y, e);
      if (handled) {
        markHandled(e);
        return;
      }
    }

    // ── Token + fog interactions: only for select/move tools ────────────
    if (activeTool !== 'select' && activeTool !== 'move') return;

    // 1. Hit-test individual tokens
    const tokenId = this.hitTestTokens(worldPos.x, worldPos.y);
    if (tokenId) {
      markHandled(e);
      this.interactionController.handleViewportTokenPointerDown(tokenId, e);
      // Drawings selected alongside the token follow its drag
      if (e.button === 0) this.drawingDragStartHandler?.(e);
      return;
    }

    // 2. Hit-test selection bounding box (drag from within the selected group; shift is picking, not dragging)
    if (e.button === 0 && !e.shiftKey) {
      const selectedIds = this.store.getState().selectedIds;
      if (selectedIds.length > 1 && this.isPointInSelectionBounds(worldPos.x, worldPos.y, selectedIds)) {
        markHandled(e);
        this.startGroupDrag(e);
        return;
      }
    }

    // 3. Hit-test drawings (select + drag, or context menu; tokens selected alongside follow a drag)
    if (this.drawingHitTestProvider && this.drawingClickHandler) {
      const drawingId = this.drawingHitTestProvider(worldPos.x, worldPos.y);
      if (drawingId) {
        markHandled(e);
        this.drawingClickHandler(drawingId, e);
        if (e.button === 0) this.startTokenGroupDrag(e);
        return;
      }
    }

    // 4. Linked hexes open their note on click; the event stays unhandled, so a drag still pans or selects
    const hexLinkId = e.button === 0 ? this.hexLinkHandlers?.hitTest(worldPos.x, worldPos.y) ?? null : null;
    if (hexLinkId) {
      this.hexLinkHandlers?.press(hexLinkId, e);
    }

    // 5. Hit-test fog (left-click selection); a whole-map fog must not hide linked hexes
    if (!hexLinkId && this.fogHitTestProvider && this.fogClickHandler) {
      const fogId = this.fogHitTestProvider(worldPos.x, worldPos.y);
      if (fogId) {
        markHandled(e);
        this.fogClickHandler(fogId, e);
        return;
      }
    }

    // 6. Nothing hit — clear selection for move tool on empty-space left-click (shift keeps it)
    if (e.button === 0 && activeTool === 'move' && !e.shiftKey) {
      const selectedIds = this.store.getState().selectedIds;
      if (selectedIds.length > 0) {
        this.store.getState().clearSelection();
      }
    }

    // Let the event propagate for viewport panning and marquee selection
  };

  /**
   * PIXI listens for pointermove on the whole document, so moves over DOM
   * overlays (note previews, panels) still reach the viewport. Only the
   * canvas itself may drive hover state; leaving the canvas clears it.
   */
  private isPointerOverCanvas(e: FederatedPointerEvent): boolean {
    const canvas = this.pixiApp?.canvas;
    const target = e.nativeEvent?.target;
    return !canvas || !(target instanceof Node) || target === canvas;
  }

  /**
   * Nothing on the map is hovered once the pointer leaves the canvas. A hover
   * left behind would open its note or statblock preview on every later
   * Cmd/Ctrl press, anywhere in Obsidian.
   */
  private onCanvasPointerLeave = (): void => {
    if (this.interactionController.isDraggingTokens()) return;
    if (this.lastHoveredPinId) {
      this.pinHoverHandler?.('out', this.lastHoveredPinId);
      this.lastHoveredPinId = null;
    }
    this.hexLinkHandlers?.hover(null);
    this.lightHandlers?.leave();
    this.interactionController.handleViewportTokenHover(null);
    this.uiManager.setHoverState(null);
  };

  private onViewportPointerMove = (e: FederatedPointerEvent): void => {
    // If dragging, InteractionController already has viewport listeners — skip hover
    if (this.interactionController.isDraggingTokens()) return;
    if (!this.isPointerOverCanvas(e)) return;

    const worldPos = this.viewport.toWorld(e.global);
    const activeTool = this.store.getState().activeTool;
    if (activeTool !== 'select' && activeTool !== 'move') {
      this.hexLinkHandlers?.hover(null, e);
    }

    // Pin hover: show pointer cursor and emit preview events from any tool
    if (this.pinHitTestProvider) {
      const pinId = this.pinHitTestProvider(worldPos.x, worldPos.y);
      if (pinId !== this.lastHoveredPinId) {
        if (this.lastHoveredPinId) {
          this.pinHoverHandler?.('out', this.lastHoveredPinId, e);
        }
        if (pinId) {
          this.pinHoverHandler?.('over', pinId, e);
        }
        this.lastHoveredPinId = pinId;
      }
      if (pinId) {
        this.interactionController.handleViewportTokenHover(null);
        this.uiManager.setHoverState(null);
        this.hexLinkHandlers?.hover(null, e);
        this.applyCursor('pointer');
        return;
      }
    }

    // Clear pin hover if we moved off a pin
    if (this.lastHoveredPinId) {
      this.pinHoverHandler?.('out', this.lastHoveredPinId, e);
      this.lastHoveredPinId = null;
    }

    // Light markers and range rings: hover and cursor from any tool
    const lightCursor = this.lightHandlers?.cursorAt(worldPos.x, worldPos.y) ?? null;

    // Wall tool: pointer move for vertex dragging, freeform drawing, and hover cursors
    if (activeTool === 'wall' && this.wallPointerMoveHandler) {
      this.wallPointerMoveHandler(worldPos.x, worldPos.y, e);

      const wallCursor = this.wallCursorProvider?.(worldPos.x, worldPos.y) ?? 'crosshair';
      this.applyCursor(lightCursor ?? wallCursor);
      return;
    }

    if (lightCursor) {
      this.interactionController.handleViewportTokenHover(null);
      this.uiManager.setHoverState(null);
      this.hexLinkHandlers?.hover(null, e);
      this.applyCursor(lightCursor);
      return;
    }

    // Audio tool: pointer move for cursor updates
    if (activeTool === 'audio' && this.audioPointerMoveHandler) {
      this.audioPointerMoveHandler(worldPos.x, worldPos.y, e);
      this.applyCursor('crosshair');
      return;
    }

    // Token hover: only for select/move tools
    if (activeTool !== 'select' && activeTool !== 'move') {
      this.interactionController.handleViewportTokenHover(null);
      this.uiManager.setHoverState(null);
      this.viewport.cursor = 'default';
      return;
    }

    const tokenId = this.hitTestTokens(worldPos.x, worldPos.y);
    const hexLinkId = tokenId ? null : this.hexLinkHandlers?.hitTest(worldPos.x, worldPos.y) ?? null;

    this.interactionController.handleViewportTokenHover(tokenId, e);
    this.uiManager.setHoverState(tokenId, isModHeld(e));
    this.hexLinkHandlers?.hover(hexLinkId, e);

    this.applyCursor(tokenId || hexLinkId ? 'pointer' : 'default');
  };

  /** Sets the viewport cursor and re-applies it after PIXI's own cursor write for this event. */
  private applyCursor(cursor: string): void {
    this.viewport.cursor = cursor;
    const canvas = this.pixiApp?.canvas;
    if (canvas) {
      queueMicrotask(() => setCanvasCursor(canvas, cursor));
    }
  }

  private onViewportPointerUp = (): void => {
    if (this.store.getState().activeTool === 'wall') {
      this.wallPointerUpHandler?.();
    }
  };

  private onCanvasDoubleClick = (): void => {
    if (this.store.getState().activeTool === 'wall') this.wallDoubleClickHandler?.();
  };

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
    const tokens = this.store.getState().objects.tokens;
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
