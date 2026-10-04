import type { ResourceDefsProvider } from '../../resources/resourceTypes';
import type { AtlasSettings } from '../../services/SettingsService';
import type { LayerVisibility } from '../playerSafeFrame';
/**
 * Token UI Manager
 * 
 * Coordinates all UI elements for tokens including health bars, nameplates,
 * controls, rotation handles, and resize handles.
 */

import { Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ITokenUIManager, TokenGroupContainer } from './types';
import type { TokenEntity } from '../../types';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import { TokenUIRenderer } from '../TokenUIRenderer';
import { TOKEN_UI_Z_INDEX, TokenControlsUI } from '../TokenControlsUI';
import { TokenRotationUI } from '../TokenRotationUI';
import { TokenResizeUI } from '../TokenResizeUI';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { destroyTree } from '../utils/destroyTree';
import { restingTokenUIScale } from './tokenSizing';

export class UIManager implements ITokenUIManager {
  private viewport: Viewport;
  private store: ViewAtlasStore;
  private viewId: string;
  private isPlayerView: boolean;
  
  // UI containers and renderers
  private uiContainer: Container;
  private playerUIContainer: Container | null = null;
  private playerTokenUIs: Record<string, TokenUIRenderer> = {};
  private tokenUIs: Record<string, TokenUIRenderer> = {};
  private tokenControlsUI?: TokenControlsUI;
  private tokenRotationUI?: TokenRotationUI;
  private tokenResizeUI?: TokenResizeUI;
  
  // Condition definitions provider — forwarded to each TokenUIRenderer
  public conditionDefsProvider: (() => ConditionDefinition[]) | null = null;
  /** The resources of the map's collection; read on every draw, so set it before tokens are created. */
  public resourceDefsProvider: ResourceDefsProvider = () => [];

  // Hover handlers for UI elements
  private uiHoverHandlers: Record<string, { over: () => void; out: () => void }> = {};
  private _prevHoverId: string | null = null;
  private _prevModifier = false;
  
  // Store unsubscribe functions
  private unsubscribeSelection?: () => void;
  private unsubscribeSettings?: () => void;
  private unsubscribeGrid?: () => void;
  private unsubscribeViewport?: () => void;

  constructor(
    viewport: Viewport,
    store: ViewAtlasStore,
    viewId: string,
    isPlayerView: boolean = false
  ) {
    this.viewport = viewport;
    this.store = store;
    this.viewId = viewId;
    this.isPlayerView = isPlayerView;
    
    // Create UI container for non-rotating elements
    this.uiContainer = new Container();
    this.uiContainer.sortableChildren = true;
    this.uiContainer.eventMode = 'passive'; // UI should not block token interactions
    this.uiContainer.interactiveChildren = true;
    this.uiContainer.zIndex = TOKEN_UI_Z_INDEX;
    this.viewport.addChild(this.uiContainer);
    
    // Force viewport to sort children to ensure proper z-ordering
    this.viewport.sortChildren();
    
    // Token controls are DM-only
    if (!this.isPlayerView) {
      this.tokenControlsUI = new TokenControlsUI(this.viewport, this.store);
      this.tokenControlsUI.resourceDefsProvider = () => this.resourceDefsProvider();
      this.tokenControlsUI.slotsProvider = (tokenId) => this.tokenUIs[tokenId]?.getResourceSlots() ?? [];
      this.tokenRotationUI = new TokenRotationUI(this.viewport, this.store);
      this.tokenResizeUI = new TokenResizeUI(this.viewport, this.store);
      
      // Set up cross-references between rotation and resize UI
      this.tokenRotationUI.setResizeUI(this.tokenResizeUI);
    }
    
    // Set up subscriptions
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // Subscribe to selection changes
    this.unsubscribeSelection = this.store.subscribe(
      (state: ViewAtlasState) => state.selectedIds,
      (selectedIds: string[]) => this.updateSelectionUI(selectedIds)
    );
    
    // Subscribe to token settings changes
    this.unsubscribeSettings = this.store.subscribe(
      (state: ViewAtlasState) => state.tokenSettings,
      () => this.updateAllTokenSettings()
    );
    
    // Subscribe to grid changes to reposition selection controls/handles
    this.unsubscribeGrid = this.store.subscribe(
      (state: ViewAtlasState) => state.grid,
      () => this.refreshSelectionControls()
    );

    // A selected token's bars keep their size on screen, so they follow the zoom like map pins
    const onZoom = (): void => {
      for (const ui of Object.values(this.tokenUIs)) ui.refreshScale();
    };
    this.viewport.on('zoomed', onZoom);
    this.viewport.on('zoomed-end', onZoom);
    this.unsubscribeViewport = (): void => {
      this.viewport.off('zoomed', onZoom);
      this.viewport.off('zoomed-end', onZoom);
    };
  }

  createTokenUI(tokenId: string, container: TokenGroupContainer, token: TokenEntity): TokenUIRenderer | null {
    // Only create UI for character tokens
    if (token.kind !== 'character') {
      return null;
    }
    
    const ui = new TokenUIRenderer(this.store, this.viewport.options?.ticker);
    ui.conditionDefsProvider = this.conditionDefsProvider;
    ui.resourceDefsProvider = () => this.resourceDefsProvider();
    ui.zoomProvider = () => this.viewport.scale.x;
    ui.onScaleChange = (scale) => this.tokenControlsUI?.setScaleFor(tokenId, scale);
    this.tokenUIs[tokenId] = ui;
    
    const uiElement = ui.getContainer();
    this.uiContainer.addChild(uiElement);
    
    // Initial update and position sync
    ui.update(token, container.tokenSize || 70);
    this.syncUIPosition(tokenId, container.position.x, container.position.y);
    
    // Set up hover handlers for the UI
    this.setupUIHoverHandlers(tokenId, container);
    
    return ui;
  }

  updateTokenUI(tokenId: string, token: TokenEntity): void {
    const ui = this.tokenUIs[tokenId];
    if (!ui || token.kind !== 'character') {
      return;
    }
    
    const tokenSprite = this.getTokenSprite(tokenId);
    if (!tokenSprite) {
      return;
    }
    
    // Get sprite dimensions
    const sprite = tokenSprite.getChildByLabel('tokenSprite');
    ui.update(token, sprite?.width || 70);
  }

  updateSelectionUI(selectedTokenIds: string[]): void {
    // Update TokenControlsUI based on selection
    if (this.tokenControlsUI) {
      if (selectedTokenIds.length === 1) {
        const tokenId = selectedTokenIds[0];
        if (tokenId) {
          const tokenSprite = this.getTokenSprite(tokenId);
          if (tokenSprite) {
            const sprite = tokenSprite.getChildByLabel('tokenSprite');
            const tokenSize = sprite?.width || 70;
            this.tokenControlsUI.show(
              tokenId,
              tokenSprite.position.x,
              tokenSprite.position.y,
              tokenSize,
              this.barScale(tokenId)
            );
          }
        }
      } else {
        this.tokenControlsUI.hide();
      }
    }
    
    // Update rotation UI based on selection
    if (this.tokenRotationUI) {
      if (selectedTokenIds.length === 1) {
        const tokenId = selectedTokenIds[0];
        if (tokenId) {
          const tokenSprite = this.getTokenSprite(tokenId);
          if (tokenSprite) {
            const sprite = tokenSprite.getChildByLabel('tokenSprite');
            const tokenSize = sprite?.width || 70;
            this.tokenRotationUI.show(tokenId, tokenSize);
          }
        }
      } else {
        this.tokenRotationUI.hide();
      }
    }
    
    // Update resize UI based on selection
    if (this.tokenResizeUI) {
      if (selectedTokenIds.length === 1) {
        const tokenId = selectedTokenIds[0];
        if (tokenId) {
          const tokenSprite = this.getTokenSprite(tokenId);
          if (tokenSprite) {
            const sprite = tokenSprite.getChildByLabel('tokenSprite');
            const tokenSize = sprite?.width || 70;
            this.tokenResizeUI.show(tokenId, tokenSize);
          }
        }
      } else {
        this.tokenResizeUI.hide();
      }
    }
    
    // Update selection state for all token UIs
    for (const tokenId in this.tokenUIs) {
      const ui = this.tokenUIs[tokenId];
      if (ui) {
        const isSelected = selectedTokenIds.includes(tokenId);
        ui.setSelectionState(isSelected);
      }
    }
  }

  /** Re-trigger selection UI to reposition controls/handles after grid changes. */
  private refreshSelectionControls(): void {
    const selectedIds = this.store.getState().selectedIds;
    if (selectedIds.length > 0) {
      this.updateSelectionUI(selectedIds);
    }
  }

  showTokenControls(tokenId: string, container: Container): void {
    const sprite = container.getChildByLabel('tokenSprite');
    const tokenSize = sprite?.width || 70;
    
    if (this.tokenControlsUI) {
      this.tokenControlsUI.show(
        tokenId,
        container.position.x,
        container.position.y,
        tokenSize,
        this.barScale(tokenId)
      );
    }
    
    if (this.tokenRotationUI) {
      this.tokenRotationUI.show(tokenId, tokenSize);
    }
    
    if (this.tokenResizeUI) {
      this.tokenResizeUI.show(tokenId, tokenSize);
    }
  }

  hideTokenControls(): void {
    this.tokenControlsUI?.hide();
    this.tokenRotationUI?.hide();
    this.tokenResizeUI?.hide();
  }

  destroyTokenUI(tokenId: string): void {
    const playerUI = this.playerTokenUIs[tokenId];
    if (playerUI) {
      playerUI.getContainer().removeFromParent();
      playerUI.destroy();
      delete this.playerTokenUIs[tokenId];
    }
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      const uiElement = ui.getContainer();
      if (uiElement.parent) {
        uiElement.parent.removeChild(uiElement);
      }
      ui.destroy();
      delete this.tokenUIs[tokenId];
    }
    
    // Clean up hover handlers
    if (this.uiHoverHandlers[tokenId]) {
      delete this.uiHoverHandlers[tokenId];
    }
  }

  /**
   * Destroy all token-specific UIs while preserving singleton controls
   * Used when switching maps to clear token UIs without losing control UI instances
   */
  destroyAllTokenUIs(): void {
    // Destroy all token UIs
    for (const tokenId in this.tokenUIs) {
      this.destroyTokenUI(tokenId);
    }
    // Controls (tokenControlsUI, tokenRotationUI, tokenResizeUI) remain intact
  }

  destroyAll(): void {
    // Destroy all token UIs
    for (const tokenId in this.tokenUIs) {
      this.destroyTokenUI(tokenId);
    }
    
    // Destroy control UIs
    this.tokenControlsUI?.destroy();
    this.tokenRotationUI?.destroy();
    this.tokenResizeUI?.destroy();
    
    // Unsubscribe from stores
    this.unsubscribeSelection?.();
    this.unsubscribeSettings?.();
    this.unsubscribeGrid?.();
    this.unsubscribeViewport?.();
    
    // Remove and destroy UI container
    if (this.uiContainer.parent) {
      this.uiContainer.parent.removeChild(this.uiContainer);
    }
    destroyTree(this.uiContainer);
    if (this.playerUIContainer) destroyTree(this.playerUIContainer);
    this.playerUIContainer = null;
  }

  // Helper methods

  syncUIPosition(tokenId: string, x: number, y: number): void {
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      ui.getContainer().position.set(x, y);
    }
  }

  syncUIScale(tokenId: string, tokenSize: number): void {
    const ui = this.tokenUIs[tokenId];
    if (ui) {
      const token = this.store.getState().objects?.tokens?.[tokenId];
      if (token && token.kind === 'character') {
        ui.update(token, tokenSize);
      }
    }
    const tokenGroup = this.getTokenSprite(tokenId);
    if (tokenGroup) {
      this.tokenControlsUI?.followTokenSize(tokenId, tokenGroup.position.x, tokenGroup.position.y, tokenSize);
    }
  }

  updateControlsPosition(x: number, y: number, tokenSize: number): void {
    this.tokenControlsUI?.updatePosition(x, y, tokenSize);
  }

  /** Keeps the UI of `tokenIds` at rest while the pointer holds or drags them; the rest are released. */
  setTokensHeld(tokenIds: string[]): void {
    for (const [tokenId, ui] of Object.entries(this.tokenUIs)) ui.setHeld(tokenIds.includes(tokenId));
  }

  /** Scale of `tokenId`'s bars, which its +/- controls match. */
  private barScale(tokenId: string): number {
    return this.tokenUIs[tokenId]?.getUIScale() ?? restingTokenUIScale(this.store.getState().grid?.size ?? 70);
  }

  updateHandlePositions(): void {
    this.tokenRotationUI?.updateHandlePositions();
    this.tokenResizeUI?.updateHandlePositions();
  }

  /** Shows or hides a token's UI with its token; while hidden, no later update of the token shows it again. */
  setTokenUIVisibility(tokenId: string, visible: boolean): void {
    this.tokenUIs[tokenId]?.setHiddenWithToken(!visible);
  }

  private setupUIHoverHandlers(tokenId: string, tokenGroup: Container): void {
    const ui = this.tokenUIs[tokenId];
    if (!ui) return;
    
    const uiContainer = ui.getContainer();
    
    // UI container must NOT be interactive — it sits at z=100 above tokens
    // and would intercept pointerdown events, blocking click and drag.
    uiContainer.eventMode = 'passive';
    uiContainer.interactiveChildren = false;

    // No pointer event listeners needed — hover state is driven by
    // TokenRenderer.onViewportPointerMove → UIManager.setHoverState().
  }

  /** Viewport-driven hover state update. Pass null to clear all hover. */
  public setHoverState(tokenId: string | null, modifierKeyDown = false): void {
    const changed = tokenId !== this._prevHoverId;
    const modChanged = modifierKeyDown !== this._prevModifier;
    this._prevModifier = modifierKeyDown;

    if (!changed && !modChanged) return;

    // Clear previous hover (only if the hovered token changed)
    if (changed && this._prevHoverId) {
      const prevUi = this.tokenUIs[this._prevHoverId];
      if (prevUi) {
        prevUi.setHoverState(false, false);
      }
    }

    if (changed) this._prevHoverId = tokenId;

    // Set / update hover on current token
    if (tokenId) {
      const ui = this.tokenUIs[tokenId];
      if (ui) {
        ui.setHoverState(true, modifierKeyDown);
      }
    }
  }

  /** Redraws every token's condition badges, after the collection's condition definitions changed. */
  public refreshConditions(): void {
    for (const ui of [...Object.values(this.tokenUIs), ...Object.values(this.playerTokenUIs)]) ui.refreshConditions();
  }

  /** Redraws every token's resources, after the collection's resource definitions changed. */
  public refreshResources(): void {
    this.updateAllTokenSettings();
  }

  /** How far a selected token's resources reach beyond its bottom, right and top edges, in world units. */
  public barsReach(tokenId: string): number {
    return this.tokenUIs[tokenId]?.getBarsReach() ?? 0;
  }

  private updateAllTokenSettings(): void {
    // Update all token UIs when settings change
    for (const tokenId in this.tokenUIs) {
      const ui = this.tokenUIs[tokenId];
      const token = this.store.getState().objects?.tokens?.[tokenId];
      if (ui && token && token.kind === 'character') {
        this.updateTokenUI(tokenId, token);
      }
    }
    // The +/- controls sit on the resources just redrawn
    this.updateSelectionUI(this.store.getState().selectedIds);
  }

  private getTokenSprite(tokenId: string): TokenGroupContainer | null {
    // This will need to be provided by TokenRenderer
    // For now, return null - will be fixed in integration
    return null;
  }

  // Public API for TokenRenderer integration

  setTokenSpriteProvider(provider: (tokenId: string) => TokenGroupContainer | null): void {
    this.getTokenSprite = provider;
  }

  /** The GM's token UI, shown for every token that has any (also those session view hides), and never the players' copy of it. */
  getGmViewLayers(): LayerVisibility[] {
    return [
      { layer: this.uiContainer, visible: true },
      ...(this.playerUIContainer ? [{ layer: this.playerUIContainer, visible: false }] : []),
      ...Object.values(this.tokenUIs).map((ui) => ({ layer: ui.getContainer(), visible: ui.showsContent })),
    ];
  }

  /** Cached player overlays keep player preferences independent of the DM UI. */
  getPlayerViewLayers(
    settings: Pick<AtlasSettings['localPlayerView'], 'showTokenNameplates'>,
    isSeen: (tokenId: string) => boolean = () => true,
  ): LayerVisibility[] {
    if (!this.playerUIContainer) {
      this.playerUIContainer = new Container();
      this.playerUIContainer.zIndex = this.uiContainer.zIndex;
      this.playerUIContainer.eventMode = 'none';
      this.playerUIContainer.visible = false;
      this.viewport.addChild(this.playerUIContainer);
    }
    const state = this.store.getState();
    for (const tokenId of Object.keys(this.tokenUIs)) {
      const token = state.objects.tokens[tokenId];
      const sprite = this.getTokenSprite(tokenId);
      if (!token || token.kind !== 'character' || !sprite) continue;
      let ui = this.playerTokenUIs[tokenId];
      if (!ui) {
        ui = new TokenUIRenderer(this.store, this.viewport.options?.ticker);
        this.playerTokenUIs[tokenId] = ui;
        this.playerUIContainer.addChild(ui.getContainer());
      }
      ui.conditionDefsProvider = this.conditionDefsProvider;
      ui.resourceDefsProvider = () => this.resourceDefsProvider();
      ui.update(token, sprite.tokenSize || 70, settings);
      ui.getContainer().position.copyFrom(sprite.position);
      ui.getContainer().renderable = sprite.visible && !token.isHidden && isSeen(tokenId) && !state.objectMask.ghost[tokenId];
    }
    const dmControls: Container[] = [
      ...(this.tokenControlsUI ? [this.tokenControlsUI.getContainer()] : []),
      ...(this.tokenRotationUI?.getHandles() ?? []),
      ...(this.tokenResizeUI?.getHandles() ?? []),
    ];
    return [
      { layer: this.uiContainer, visible: false },
      { layer: this.playerUIContainer, visible: true },
      ...dmControls.map(layer => ({ layer, visible: false })),
    ];
  }

  getUIContainer(): Container {
    return this.uiContainer;
  }

  getTokenUIs(): Record<string, TokenUIRenderer> {
    return this.tokenUIs;
  }

  getControlsUI(): TokenControlsUI | undefined {
    return this.tokenControlsUI;
  }

  getRotationUI(): TokenRotationUI | undefined {
    return this.tokenRotationUI;
  }

  getResizeUI(): TokenResizeUI | undefined {
    return this.tokenResizeUI;
  }
}
