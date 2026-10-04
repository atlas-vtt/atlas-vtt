/**
 * Token Interaction Controller
 * 
 * Handles all pointer interactions with tokens including drag & drop,
 * hover effects, context menus, and path recording for smooth animations.
 */

import type { ResourceDefsProvider } from '../../resources/resourceTypes';
import { isKillable, resetLabel } from '../../resources/resourceValues';
import { visibleResources } from '../../resources/visibleResources';
import React from 'react';
import { Container, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { App } from 'obsidian';
import { openEditTokenModal } from './EditTokenModal';
import { STATBLOCK_UNLINK_UPDATES } from './statblockFrontmatter';
import { openContextMenuGlobal, closeContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import { DestructiveActionRow } from './DestructiveActionRow';
import type { ITokenInteractionController, TokenGroupContainer } from './types';
import type { Character, TokenEntity } from '../../types';
import type { ViewAtlasState } from '../../storeFactory';
import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../grid/GridSystem';
import { resizedTokenCenter } from '../../grid/gridPlacement';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import { initiativeEntryForToken } from '../../stores/initiativeEntries';
import { EventEmitter } from 'events';
import { StatblockDialogService } from '../../services/StatblockDialogService';
import { TokenStatblockLinkService } from '../../services/TokenStatblockLinkService';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { dynamicLightingOn } from '../../experimental/experimentalFeatures';
import { saveMapTokensAsEncounter } from '../../encounters/saveMapTokensAsEncounter';
import { copyMapObjects } from '../../clipboard/mapClipboardActions';
import { copyDragSelection } from './dragCopy';
import type { DragRuler } from './DragRuler';
import { runInBackground } from '../../utils/backgroundTask';
import { tokenSizeSubmenu } from '../../react/components/context-menu/tokenSizeMenu';
import { tokenLightingEntries } from '../../react/components/context-menu/tokenLightingMenu';
import { mapLightPresets } from '../../services/mapCollectionRules';
import { conditionsSubmenu } from '../../react/components/context-menu/conditionsMenu';
import { holdTokens } from '../../lighting/sightOnDrop';
import { addonObjectMenuEntries } from '../../addons/addonHost';

interface DragState {
  isDragging: boolean;
  dragIds: string[];
  dragStartPointer: { x: number; y: number };
  /** Where the pointer was last seen, in world pixels: a drag whose pointer is lost drops there. */
  lastPointer?: { x: number; y: number };
  initialPositions: Record<string, { x: number; y: number }>;
  animationFrameId?: number;
  pendingUpdate: boolean;
  hasMoved: boolean;
  clickToken?: TokenEntity;
  /** Alt/Option was held at pointer down: the drag moves copies and leaves the originals. */
  copyOnDrag?: boolean;
  /** The token the pointer grabbed; the drag ruler measures its path. */
  rulerTokenId?: string;
}

export class InteractionController implements ITokenInteractionController {
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private gridSystem: GridSystem;
  private eventBus: EventEmitter;
  private obsApp: App;
  public isPlayerView: boolean;
  
  // Condition definitions provider — wired by PixiRendererOrchestrator
  public conditionDefsProvider: (() => ConditionDefinition[]) | null = null;
  /** The resources of the map's collection, for Kill and Reset. */
  public resourceDefsProvider: ResourceDefsProvider = () => [];
  
  // Drag state
  private dragState: DragState = {
    isDragging: false,
    dragIds: [],
    dragStartPointer: { x: 0, y: 0 },
    initialPositions: {},
    pendingUpdate: false,
    hasMoved: false
  };
  private lastDragStreamSentAt = 0;
  
  // Hover handlers
  private hoverHandlers: Record<string, { over: (e?: FederatedPointerEvent) => void; out: () => void }> = {};
  private _currentHoverId: string | null = null;
  
  // Callbacks for external systems
  private onSelectionUpdate?: () => void;
  private onTokenMove?: (tokenId: string, x: number, y: number) => void;
  private getTokenSprite?: (tokenId: string) => TokenGroupContainer | null;
  private updateUIPosition?: (tokenId: string, x: number, y: number) => void;
  private updateControlsPosition?: (x: number, y: number, tokenSize: number) => void;
  private onTokensHeldChange?: (tokenIds: string[]) => void;
  private updateHandlePositions?: () => void;
  private dragRuler?: DragRuler;
  /** Where a lost pointer is heard while the pointer is down (`watchLostPointer`). */
  private lostPointerTargets: { canvas: HTMLElement; win: Window | null } | null = null;

  constructor(
    viewport: Viewport,
    store: StoreApi<ViewAtlasState>,
    gridSystem: GridSystem,
    eventBus: EventEmitter,
    obsApp: App,
    isPlayerView: boolean = false
  ) {
    this.viewport = viewport;
    this.store = store;
    this.gridSystem = gridSystem;
    this.eventBus = eventBus;
    this.obsApp = obsApp;
    this.isPlayerView = isPlayerView;
  }

  attachInteractionHandlers(_tokenId: string, _container: Container, _token: TokenEntity): void {
    // No-op: sprites are non-interactive. Viewport-level dispatch handles all pointer events.
  }

  removeInteractionHandlers(_tokenId: string, _container: Container): void {
    // No-op: sprites are non-interactive. Viewport-level dispatch handles all pointer events.
  }

  setupHoverHandlers(
    _tokenId: string, 
    _container: Container,
    _onHover: (tokenId: string) => void,
    _onHoverEnd: (tokenId: string) => void
  ): void {
    // No-op: sprites are non-interactive. Viewport-level dispatch drives hover state.
  }


  /** Called by TokenRenderer when viewport pointerdown hits a token. */
  public handleViewportTokenPointerDown(tokenId: string, e: FederatedPointerEvent): void {
    const activeTool = this.store.getState().activeTool;
    if (activeTool === 'measure' || activeTool === 'measure-circle' || activeTool === 'measure-cone') {
      return;
    }

    e.stopPropagation();

    if (e.button === 2) {
      const token = this.store.getState().objects.tokens[tokenId];
      if (token && !this.isPlayerView) {
        this.showContextMenu(token, e);
      }
      return;
    }

    const token = this.store.getState().objects.tokens[tokenId];
    if (!token) return;
    if (this.isPlayerView) {
      return;
    }

    this.prepareInteraction(token, e);
  }

  /** Starts a group drag for the given token IDs (click within selection bounding box). */
  public handleViewportGroupDragStart(tokenIds: string[], e: FederatedPointerEvent): void {
    if (e.button !== 0) return;

    const activeTool = this.store.getState().activeTool;
    if (activeTool !== 'select' && activeTool !== 'move') return;

    e.stopPropagation();

    if (this.isPlayerView || tokenIds.length === 0) {
      return;
    }

    // Use the first token as the reference for prepareInteraction (it will detect the multi-selection)
    const firstToken = this.store.getState().objects.tokens[tokenIds[0]!];
    if (!firstToken) return;

    this.prepareInteraction(firstToken, e);
  }

  /** Called by TokenRenderer when viewport pointermove hovers over a token (or null to clear). */
  public handleViewportTokenHover(tokenId: string | null, e?: FederatedPointerEvent): void {
    // Clear previous hover if target changed
    const prevId = this._currentHoverId ?? null;
    if (prevId === tokenId) return;

    if (prevId) {
      this.handleHoverEnd(prevId);
      // Emit hide preview for previous token
      const prevToken = this.store.getState().objects.tokens[prevId];
      if (prevToken?.kind === 'character' && prevToken.statblockPath?.trim()) {
        this.eventBus.emit('pin-hide-preview', {
          pin: { id: prevToken.id, notePath: prevToken.statblockPath, x: prevToken.x, y: prevToken.y, type: 'token' },
        });
      }
    }

    this._currentHoverId = tokenId;

    if (tokenId) {
      this.handleHoverStart(tokenId);
      // Emit hover preview for new token
      const token = this.store.getState().objects.tokens[tokenId];
      if (token?.kind === 'character' && e && token.statblockPath?.trim()) {
        this.eventBus.emit('pin-hover-preview', {
          pin: {
            id: token.id,
            notePath: token.statblockPath,
            x: token.x,
            y: token.y,
            type: 'token',
            // Vitals travel with the pin so the preview can mirror them.
            name: token.name,
            resources: token.resources,
            imagePath: token.imagePath,
            ringColor: token.ringColor,
            showRing: token.showRing,
          },
          screenX: e.clientX,
          screenY: e.clientY,
          pixiEvent: e,
        });
      }
    }
  }

  /** Query whether a drag is in progress. */
  public isDraggingTokens(): boolean {
    return this.dragState.isDragging;
  }

  private prepareInteraction(token: TokenEntity, e: FederatedPointerEvent): void {
    // A second pointer (another finger) pressing during a drag is not a new gesture: taking it
    // would let go of the held tokens and leave the drag's history transaction open.
    if (this.dragState.isDragging && this.dragState.hasMoved) return;

    const { selectedIds, setSelection } = this.store.getState();
    const isTokenSelected = selectedIds.includes(token.id);

    // Shift-click toggles membership; removing never starts a drag.
    if (e.shiftKey && isTokenSelected) {
      setSelection(selectedIds.filter((id) => id !== token.id));
      return;
    }

    this.viewport.plugins.pause('drag');
    
    // Clean up any existing listeners before attaching new ones
    // This prevents accumulation if previous interaction didn't clean up properly
    this.cleanupDragListeners();
    
    // Store the token for potential click handling
    this.dragState.clickToken = token;
    this.dragState.hasMoved = false;
    this.dragState.copyOnDrag = e.altKey;
    
    // Determine which tokens to potentially drag
    if (e.shiftKey) {
      this.dragState.dragIds = [...selectedIds, token.id];
      setSelection(this.dragState.dragIds);
    } else if (isTokenSelected && selectedIds.length > 1) {
      this.dragState.dragIds = [...selectedIds];
    } else {
      this.dragState.dragIds = [token.id];
      // Always select the clicked token immediately
      // This ensures clicking on a different token switches selection
      setSelection(this.dragState.dragIds);
    }

    // Initialize drag state
    const worldPos = this.viewport.toWorld(e.global);
    this.dragState.dragStartPointer = { x: worldPos.x, y: worldPos.y };
    this.dragState.lastPointer = this.dragState.dragStartPointer;
    this.dragState.initialPositions = {};
    
    for (const id of this.dragState.dragIds) {
      const sprite = this.getTokenSprite?.(id);
      if (sprite) {
        this.dragState.initialPositions[id] = { x: sprite.position.x, y: sprite.position.y };
      }
    }
    
    this.dragState.isDragging = true;
    // Tokens this press selects stay at rest until release, so a drag never grows their UI first
    this.reportHeld(this.dragState.dragIds.filter((id) => !selectedIds.includes(id)));
    
    // Don't set isDragging in store yet - wait for actual movement
    
    // Set up drag event listeners
    this.viewport.on('pointermove', this.onPointerMove, this);
    this.viewport.on('pointerup', this.onPointerUp, this);
    this.viewport.on('pointerupoutside', this.onPointerUp, this);
    this.watchLostPointer();
  }

  /**
   * No release follows a pointer the browser cancels (a touch taken over by a system gesture)
   * or a press that outlasts the window's focus, and PIXI reports neither: the drag then ends
   * where the token is, as a drop.
   */
  private watchLostPointer(): void {
    const canvas = this.viewport.options?.events?.domElement;
    if (!canvas) return;
    const win = canvas.ownerDocument.defaultView;
    canvas.addEventListener('pointercancel', this.dropWhereItIs);
    win?.addEventListener('blur', this.dropWhereItIs);
    this.lostPointerTargets = { canvas, win };
  }

  private readonly dropWhereItIs = (): void => {
    this.endDrag(this.dragState.lastPointer ?? this.dragState.dragStartPointer);
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (!this.dragState.isDragging) return;
    
    const worldPos = this.viewport.toWorld(e.global);
    this.dragState.lastPointer = { x: worldPos.x, y: worldPos.y };
    const dx = worldPos.x - this.dragState.dragStartPointer.x;
    const dy = worldPos.y - this.dragState.dragStartPointer.y;
    const currentTime = Date.now();
    
    // Check if we've moved enough to consider it a drag (5 pixel threshold)
    const moveDistance = Math.sqrt(dx * dx + dy * dy);
    if (!this.dragState.hasMoved && moveDistance > 5) {
      this.dragState.hasMoved = true;
      this.store.getState().setIsDragging(true);
      // The whole drag becomes one undo step; closed in onPointerUp.
      beginHistoryTransaction(this.store);
      const grabbedIndex = Math.max(0, this.dragState.dragIds.indexOf(this.dragState.clickToken?.id ?? ''));
      if (this.dragState.copyOnDrag) this.dragCopiesInstead();
      // Held are the tokens that move: the copies of an Alt-drag, before anything has moved.
      this.reportHeld(this.dragState.dragIds);
      this.startDragRuler(this.dragState.dragIds[grabbedIndex]);
    }
    
    // If we haven't moved enough, don't update positions
    if (!this.dragState.hasMoved) return;
    
    for (const id of this.dragState.dragIds) {
      const sprite = this.getTokenSprite?.(id);
      if (!sprite) continue;
      
      const initPos = this.dragState.initialPositions[id];
      if (initPos) {
        const newX = initPos.x + dx;
        const newY = initPos.y + dy;
        
        // Update sprite position
        sprite.position.set(newX, newY);
        this.updateUIPosition?.(id, newX, newY);
      }
    }

    const rulerStart = this.dragState.rulerTokenId ? this.dragState.initialPositions[this.dragState.rulerTokenId] : undefined;
    if (rulerStart) this.dragRuler?.update({ x: rulerStart.x + dx, y: rulerStart.y + dy });

    // Push live positions to the store at a bounded cadence.
    if (currentTime - this.lastDragStreamSentAt >= 50) {
      // Positions come from the pointer, not the sprites: an Alt-drag copy may still be loading its sprite.
      const updates = this.dragState.dragIds.flatMap((id) => {
        const initPos = this.dragState.initialPositions[id];
        return initPos ? [{ id, x: initPos.x + dx, y: initPos.y + dy }] : [];
      });

      if (updates.length > 0) {
        // The store follows the drag, so everything that reads positions does. Sight waits for
        // the drop unless the scene has sight on drop off (`SightTokens`).
        // Persistence is debounced (1000ms) so these intermediate updates won't save,
        // and the open history transaction keeps them out of the undo stack.
        this.store.getState().setTokenPositions(updates);
        this.lastDragStreamSentAt = currentTime;
      }
    }
    
    // Schedule UI update
    if (!this.dragState.pendingUpdate && !this.dragState.animationFrameId) {
      this.dragState.pendingUpdate = true;
      this.dragState.animationFrameId = window.requestAnimationFrame(() => this.throttledUIUpdate());
    }
  };

  /** Swaps the drag over to fresh copies of the dragged tokens, which then become the selection. */
  private dragCopiesInstead(): void {
    const copies = copyDragSelection(this.store, this.dragState.dragIds, this.dragState.initialPositions);
    if (!copies) return;
    this.dragState.dragIds = copies.ids;
    this.dragState.initialPositions = copies.initialPositions;
  }

  private startDragRuler(tokenId: string | undefined): void {
    const origin = tokenId ? this.dragState.initialPositions[tokenId] : undefined;
    if (!tokenId || !origin) return;
    this.dragState.rulerTokenId = tokenId;
    this.dragRuler?.begin(tokenId, origin);
  }

  private throttledUIUpdate = () => {
    if (!this.dragState.pendingUpdate) return;
    this.dragState.pendingUpdate = false;
    delete this.dragState.animationFrameId;
    
    // Update controls position if single token selected
    const selectedIds = this.store.getState().selectedIds;
    if (selectedIds.length === 1) {
      const selectedId = selectedIds[0];
      if (selectedId) {
        const sprite = this.getTokenSprite?.(selectedId);
        if (sprite) {
          const tokenSize = sprite.getChildByLabel('tokenSprite')?.width || 70;
          this.updateControlsPosition?.(sprite.position.x, sprite.position.y, tokenSize);
        }
      }
    }
    
    // Emit drag update event
    window.dispatchEvent(new CustomEvent('atlas-tokens-drag-update', { 
      detail: { tokenIds: this.dragState.dragIds } 
    }));
    
    // Trigger selection overlay update
    this.onSelectionUpdate?.();
  };

  private cleanupDragListeners(): void {
    // Remove all drag-related event listeners from viewport
    this.viewport.off('pointermove', this.onPointerMove, this);
    this.viewport.off('pointerup', this.onPointerUp, this);
    this.viewport.off('pointerupoutside', this.onPointerUp, this);
    this.lostPointerTargets?.canvas.removeEventListener('pointercancel', this.dropWhereItIs);
    this.lostPointerTargets?.win?.removeEventListener('blur', this.dropWhereItIs);
    this.lostPointerTargets = null;
  }

  private onPointerUp = (e: FederatedPointerEvent): void => {
    this.endDrag(this.viewport.toWorld(e.global));
  };

  /** Ends the press or drag with the pointer at `worldPos`: a drag drops its tokens there, as one undo step. */
  private endDrag(worldPos: { x: number; y: number }): void {
    if (!this.dragState.isDragging) return;
    const wasDrag = this.dragState.hasMoved;

    try {
      this.dragState.isDragging = false;
      
      // Check if this was a click (no significant movement)
      if (!this.dragState.hasMoved && this.dragState.clickToken) {
        // This was a click, not a drag
        // Selection was already handled in prepareInteraction
        
        // Clean up and exit early - no drag occurred
        this.cleanupDragListeners();
        this.viewport.plugins.resume('drag');
        delete this.dragState.clickToken;
        this.dragState.hasMoved = false;
        return;
      }
      
      // This was a drag
      this.store.getState().setIsDragging(false);
      
      // Clean up event listeners
      this.cleanupDragListeners();
      
      // Clean up animation frame
      if (this.dragState.animationFrameId) {
        window.cancelAnimationFrame(this.dragState.animationFrameId);
        delete this.dragState.animationFrameId;
      }
      
      // Calculate final positions
      const dx = worldPos.x - this.dragState.dragStartPointer.x;
      const dy = worldPos.y - this.dragState.dragStartPointer.y;
      
      const tokenUpdates: Array<{id: string, x: number, y: number}> = [];
      const snapToGrid = this.store.getState().grid?.snapToGrid ?? true;
      const tokens = this.store.getState().objects.tokens;
      
      for (const id of this.dragState.dragIds) {
        const initPos = this.dragState.initialPositions[id];
        if (!initPos) continue;
        
        const newX = initPos.x + dx;
        const newY = initPos.y + dy;
        
        // Snap to grid if enabled
        const finalPos = snapToGrid 
          ? this.gridSystem.snapTokenCenter(newX, newY, tokens[id]?.size || 1)
          : { x: newX, y: newY };
        
        const sprite = this.getTokenSprite?.(id);
        if (sprite) {
          sprite.position.set(finalPos.x, finalPos.y);
        }
        
        // Sync UI elements (resource bars, nameplates) to the final snapped position
        this.updateUIPosition?.(id, finalPos.x, finalPos.y);
        
        tokenUpdates.push({id, x: finalPos.x, y: finalPos.y});
      }
      
      if (tokenUpdates.length > 0) this.store.getState().dropTokens(tokenUpdates);
      
      // Update UI
      this.onSelectionUpdate?.();
      
      // Update controls position
      const selectedIds = this.store.getState().selectedIds;
      if (selectedIds.length === 1) {
        const selectedId = selectedIds[0];
        if (selectedId) {
          const finalUpdate = tokenUpdates.find(u => u.id === selectedId);
          if (finalUpdate) {
            const sprite = this.getTokenSprite?.(selectedId);
            const tokenSize = sprite?.getChildByLabel('tokenSprite')?.width || 70;
            this.updateControlsPosition?.(finalUpdate.x, finalUpdate.y, tokenSize);
          }
        }
      }
      
      // Update handle positions
      this.updateHandlePositions?.();
      
    } catch (error) {
      console.error('[InteractionController] Error in onPointerUp handler:', error);
    } finally {
      if (wasDrag) endHistoryTransaction(this.store);
      this.dragRuler?.end();
      delete this.dragState.rulerTokenId;

      // Always clean up event listeners to prevent accumulation
      this.cleanupDragListeners();

      // Always resume viewport drag
      this.viewport.plugins.resume('drag');

      // Reset drag state
      this.dragState.pendingUpdate = false;
      this.dragState.hasMoved = false;
      this.lastDragStreamSentAt = 0;
      delete this.dragState.clickToken;
      this.reportHeld([]);
    }
  }

  /** The store notes where the held tokens stand (`holdTokens`: sight waits there for the drop); then the token UI. */
  private reportHeld(tokenIds: string[]): void {
    holdTokens(this.store, tokenIds);
    this.onTokensHeldChange?.(tokenIds);
  }

  private getConditionDefs(): ConditionDefinition[] {
    return this.conditionDefsProvider?.() ?? [];
  }

  /** The selected tokens when the right-clicked token is one of them, otherwise that token alone. */
  private contextMenuTargets(tokenId: string): string[] {
    const { selectedIds, objects } = this.store.getState();
    if (!selectedIds.includes(tokenId)) return [tokenId];
    return selectedIds.filter((id) => objects.tokens[id] !== undefined);
  }

  private showContextMenu(token: TokenEntity, e: FederatedPointerEvent): void {
    const character = token.kind === 'character' ? token : undefined;
    const entries: ContextMenuEntry[] = [];

    const conditionDefs = this.getConditionDefs();
    if (conditionDefs.length > 0) {
      entries.push(conditionsSubmenu(this.store, conditionDefs, this.contextMenuTargets(token.id)));
    }

    // Size
    entries.push(tokenSizeSubmenu(token.size, size => {
      const { grid, objects, updateToken } = this.store.getState();
      const current = objects.tokens[token.id];
      if (!current) return;
      const center = resizedTokenCenter(current, current.size || 1, size, grid);
      updateToken(token.id, { size, x: center.x, y: center.y });
    }));

    // Hide/Show the selection in one undo step; the clicked token decides which way
    const currentToken = this.store.getState().objects.tokens[token.id];
    const isHidden = currentToken?.isHidden || false;
    const hideTargets = this.contextMenuTargets(token.id);
    entries.push({
      type: 'item',
      label: isHidden ? 'Show' : 'Hide',
      icon: isHidden ? 'eye' : 'eye-off',
      onClick: () => this.store.getState().updateTokens(
        hideTargets.map((id) => ({ id, changes: { isHidden: !isHidden } })),
      ),
    });

    // Vision and carried light, for the selection the token belongs to
    if (!this.isPlayerView && dynamicLightingOn(this.obsApp)) {
      const lightPresets = mapLightPresets(this.obsApp, this.store.getState());
      entries.push(...tokenLightingEntries(this.store, token.id, this.contextMenuTargets(token.id), lightPresets));
    }


    // Save the selection (or this token alone) as an encounter — DM only
    if (!this.isPlayerView) {
      const selectedIds = this.store.getState().selectedIds;
      const groupIds = selectedIds.includes(token.id) ? selectedIds : [token.id];
      entries.push({
        type: 'item',
        label: 'Duplicate',
        icon: 'files',
        onClick: () => this.store.getState().duplicateMapObjects(groupIds),
      });
      entries.push({
        type: 'item',
        label: 'Copy',
        icon: 'copy',
        onClick: () => copyMapObjects(this.store, groupIds),
      });
      entries.push({
        type: 'item',
        label: 'Save as Encounter',
        icon: 'swords',
        onClick: () => {
          void saveMapTokensAsEncounter(this.obsApp, this.store, this.gridSystem, groupIds);
        },
      });
    }

    // Edit Token
    entries.push({
      type: 'item',
      label: 'Edit Token',
      icon: 'edit',
      onClick: () => this.showEditTokenModal(token),
    });

    // Initiative, for the selection the token belongs to; the clicked token decides which way
    const initiativeEntries = this.store.getState().initiative?.entries || [];
    const isInInitiative = initiativeEntries.some((entry) => entry.tokenId === token.id);
    const initiativeTargets = this.contextMenuTargets(token.id);
    entries.push({
      type: 'item',
      label: isInInitiative ? 'Remove from Initiative' : 'Add to Initiative',
      icon: 'swords',
      onClick: () => this.handleInitiativeToggle(initiativeTargets, isInInitiative),
    });


    // Statblock linking
    const obsApp = this.obsApp;
    const statblockPath = character?.statblockPath;
    if (statblockPath) {
      entries.push({
        type: 'item',
        label: 'Edit Statblock',
        icon: 'file-text',
        onClick: async () => {
          if (obsApp) {
            const file = obsApp.vault.getAbstractFileByPath(statblockPath);
            if (file) await obsApp.workspace.openLinkText(file.path, '', true);
          }
        },
      });
      entries.push({
        type: 'item',
        label: 'Unlink Statblock',
        icon: 'unlink',
        onClick: async () => {
          if (obsApp && token.imagePath) {
            const linkService = TokenStatblockLinkService.getInstance(obsApp);
            await linkService.unlinkToken(token.imagePath);
            this.store.getState().updateToken(token.id, STATBLOCK_UNLINK_UPDATES);
          }
        },
      });
    } else {
      entries.push({
        type: 'item',
        label: 'Link Statblock',
        icon: 'link',
        onClick: () => {
          if (obsApp && token.imagePath) {
            const dialogService = new StatblockDialogService(obsApp);
            const linkService = TokenStatblockLinkService.getInstance(obsApp);
            dialogService.showStatblockDialog(
              null,
              (statblockPath: string | null) => {
                if (!statblockPath) return;
                runInBackground(
                  linkService.linkTokenToStatblock(token.imagePath, statblockPath).then(() => {
                    this.store.getState().updateToken(token.id, { statblockPath });
                  }),
                  `Linking statblock ${statblockPath}`,
                  'Could not link the statblock',
                );
              },
              character?.name || 'Token',
              { imagePath: token.imagePath, showRing: token.showRing },
            );
          }
        },
      });
    }


    // Ring color submenu
    const currentRingColor = token.ringColor;
    const ringColors = [
      { name: 'Default', value: null },
      { name: 'Blue', value: '#086ddd' },
      { name: 'Orange', value: '#ec7500' },
      { name: 'Red', value: '#e93147' },
      { name: 'Yellow', value: '#e0ac00' },
      { name: 'Brown', value: '#a97142' },
      { name: 'Purple', value: '#7852ee' },
      { name: 'Green', value: '#08b94e' },
      { name: 'Pink', value: '#d53984' },
      { name: 'Cyan', value: '#00bfbc' },
      { name: 'Gray', value: '#ababab' },
      { name: 'White', value: '#ffffff' },
    ];
    entries.push({
      type: 'submenu',
      label: 'Ring Color',
      icon: 'circle',
      children: ringColors.map(color => ({
        type: 'item' as const,
        label: color.name,
        checked: color.value === currentRingColor || (color.value === null && !currentRingColor),
        onClick: () => this.store.getState().setTokenRing(token.id, color.value),
      })),
    });

    // Reset (only if the token tracks resources)
    if (this.hasResources(character)) {
      entries.push({
        type: 'item',
        label: resetLabel(this.resourceDefsProvider()),
        icon: 'rotate-ccw',
        onClick: () => this.store.getState().resetTokens([token.id], this.resourceDefsProvider()),
      });
    }


    entries.push(...addonObjectMenuEntries(this.store, 'token', token.id, { app: this.obsApp }));

    // Destructive actions row (Kill + Delete side by side)
    entries.push({
      type: 'custom',
      render: () => this.renderDestructiveRow(token),
    });

    openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
  }

  handleDrag(
    tokenId: string,
    startX: number,
    startY: number,
    onMove: (x: number, y: number) => void,
    onEnd: (finalX: number, finalY: number, path: Array<{x: number, y: number, timestamp: number}>) => void
  ): void {
    // This method is part of the interface but drag is handled internally
    // Could be used for programmatic drag operations
  }

  emitContextMenu(tokenId: string, x: number, y: number): void {
    this.eventBus.emit('token-context-menu', { tokenId, x, y });
  }

  // Callbacks setup
  
  setSelectionUpdateCallback(callback: () => void): void {
    this.onSelectionUpdate = callback;
  }

  setTokenSpriteProvider(provider: (tokenId: string) => TokenGroupContainer | null): void {
    this.getTokenSprite = provider;
  }

  setUIPositionUpdater(updater: (tokenId: string, x: number, y: number) => void): void {
    this.updateUIPosition = updater;
  }

  setControlsPositionUpdater(updater: (x: number, y: number, tokenSize: number) => void): void {
    this.updateControlsPosition = updater;
  }

  setHandlePositionUpdater(updater: () => void): void {
    this.updateHandlePositions = updater;
  }

  /**
   * Receives the tokens whose UI stays at rest while the pointer is down: the ones a press
   * newly selects, every dragged token once a drag starts, and none on release.
   */
  setTokensHeldCallback(callback: (tokenIds: string[]) => void): void {
    this.onTokensHeldChange = callback;
  }

  setDragRuler(ruler: DragRuler): void {
    this.dragRuler = ruler;
  }

  private hasResources(character: Character | undefined): boolean {
    return character !== undefined && visibleResources(character, this.resourceDefsProvider(), 'dm').length > 0;
  }

  private renderDestructiveRow(token: TokenEntity): React.ReactNode {
    return React.createElement(DestructiveActionRow, {
      tokenId: token.id,
      store: this.store,
      canKill: token.kind === 'character' && isKillable(token, this.resourceDefsProvider()),
      definitions: this.resourceDefsProvider(),
      onClose: () => closeContextMenuGlobal(),
    });
  }

  private handleInitiativeToggle(tokenIds: string[], remove: boolean): void {
    if (!this.store.getState().initiativeTrackerOpen) {
      this.store.getState().setInitiativeTrackerOpen(true);
    }

    for (const tokenId of tokenIds) {
      const { initiative, objects, addToInitiative, removeFromInitiative } = this.store.getState();
      const entry = initiative.entries.find((e) => e.tokenId === tokenId);
      const token = objects.tokens[tokenId];
      if (remove && entry) removeFromInitiative(entry.id);
      else if (!remove && !entry && token) addToInitiative(initiativeEntryForToken(token));
    }
  }

  private handleHoverStart(tokenId: string): void {
    // Hover start logic - could emit events or update UI
  }

  private handleHoverEnd(tokenId: string): void {
    // Hover end logic - could emit events or update UI
  }

  private showEditTokenModal(token: TokenEntity): void {
    openEditTokenModal(token, this.store, this.obsApp, this.resourceDefsProvider());
  }

  destroyAll(): void {
    // Clean up all hover handlers
    for (const tokenId in this.hoverHandlers) {
      delete this.hoverHandlers[tokenId];
    }

    // A drag interrupted by teardown must not leave its transaction open
    if (this.dragState.hasMoved) endHistoryTransaction(this.store);
    holdTokens(this.store, []);
    this.dragRuler?.end();

    // Remove any active viewport listeners using the same cleanup method
    this.cleanupDragListeners();
    
    // Clean up animation frame
    if (this.dragState.animationFrameId) {
      window.cancelAnimationFrame(this.dragState.animationFrameId);
    }
    
    // Reset state
    this.dragState = {
      isDragging: false,
      dragIds: [],
      dragStartPointer: { x: 0, y: 0 },
      initialPositions: {},
      pendingUpdate: false,
      hasMoved: false
    };
  }
}
