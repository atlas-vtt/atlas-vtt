/**
 * Token Interaction Controller
 * 
 * Handles all pointer interactions with tokens including drag & drop,
 * hover effects, context menus, and path recording for smooth animations.
 */

import type { ResourceDefsProvider } from '../../resources/resourceTypes';
import { Container, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { App } from 'obsidian';
import { openEditTokenModal } from './EditTokenModal';
import { openContextMenuGlobal, closeContextMenuGlobal } from '../../react/root/ContextMenuContext';
import type { ITokenInteractionController, TokenGroupContainer } from './types';
import type { TokenEntity } from '../../types';
import type { ViewAtlasState } from '../../storeFactory';
import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../grid/GridSystem';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import { EventEmitter } from '../../utils/typedEmitter';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { copyDragSelection } from './dragCopy';
import type { DragRuler } from './DragRuler';
import type { TokenMovement } from './tokenMovement';
import { isPrimaryPress, isSecondaryPress } from '../utils/pointerButtons';
import { applySelectionResourceChange } from '../../react/components/context-menu/selectionResourceMenu';
import { selectionResources, type SelectionResource } from '../../resources/selectionResourceChange';
import { SelectionResourceEditing } from '../selectionResourceEditor';
import { holdTokens } from '../../lighting/sightOnDrop';
import { dropTokensOnStairs, type StairsMenuPlace } from './stairsDrop';
import type { TokenPreviewAnchor } from '../../services/NotePreviewUIManager';
import type { ArtFloors } from '../../levels/levelSurfaces';
import { levelObjects } from '../../levels/levelObjects';
import { mapTokens } from '../../tokens/offMap';
import type { MapSize } from '../../online/gm/moveCheck';
import { sessionDragWalls, type SessionDragWalls } from './sessionDragWalls';
import { tokenDragDistance } from '../utils/pointerReach';
import { deviceProfile } from '../../platform/deviceProfile';
import type { SelectionAction } from '../../selection/selectionActions';
import { selectionMenu } from '../../selection/selectionMenu';
import { tokenActions, type TokenActionHost } from '../../selection/tokenActionList';
import { picksMore } from '../../annotations/selectMore';
import { pasteAtViewCentre } from '../../selection/wholeSelection';
import { toolSwitch } from '../../types/toolSwitches';
import { OPEN_PREVIEW_EVENT } from '../../services/previewByHand';
import { TokenTurnDrag } from './TokenTurnDrag';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';

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
  /** The press grabbed a token outside the selection: it is selected on release if it never moved, and a drag leaves the selection as it was. */
  selectsOnRelease?: boolean;
  /** Select more is on and the press grabbed a token of the selection: it leaves the selection on release if it never moved, and a drag moves the selection. */
  deselectsOnRelease?: boolean;
  /** Alt/Option was held at pointer down: the drag moves copies and leaves the originals. */
  copyOnDrag?: boolean;
  /** Shift was held at pointer down: the drag turns the tokens to look at the pointer instead of moving them (`TokenTurnDrag`). */
  turnsOnDrag?: boolean;
  /** The token the pointer grabbed; the drag ruler measures its path. */
  rulerTokenId?: string;
  /** The walls the dragged tokens stop at (session view only), fixed when the drag starts. */
  walls?: SessionDragWalls | null;
  /** Where each dragged token stands now: under the pointer, or before the wall that stopped it. */
  current?: Record<string, { x: number; y: number }>;
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
  
  // Hover handlers
  private hoverHandlers: Record<string, { over: (e?: FederatedPointerEvent) => void; out: () => void }> = {};
  private _currentHoverId: string | null = null;
  /** The statblock preview the hover armed, hidden by itself: the token may have left the level shown since. */
  private hoverPreview: TokenPreviewAnchor | null = null;
  
  // Callbacks for external systems
  private onSelectionUpdate?: () => void;
  private onTokenMove?: (tokenId: string, x: number, y: number) => void;
  private getTokenSprite?: (tokenId: string) => TokenGroupContainer | null;
  private updateUIPosition?: (tokenId: string, x: number, y: number) => void;
  private settleToken?: (tokenId: string, x: number, y: number) => void;
  /** What the view draws of the levels' maps, through which a dropped token falls; none without lighting. */
  private artFloors: (() => ArtFloors | undefined) | undefined;
  /** The map's size in world pixels, which sets how wide walls stop a dragged token. */
  private mapSize: () => MapSize | null = () => null;
  private updateControlsPosition?: (x: number, y: number, tokenSize: number) => void;
  private onTokensHeldChange?: (tokenIds: string[]) => void;
  private updateHandlePositions?: () => void;
  private dragRuler?: DragRuler;
  /** The map's movement rules and its tokens' speeds (`tokenMovement`); a view without them moves tokens as ever. */
  private movement?: TokenMovement;
  /** Where a lost pointer is heard while the pointer is down (`watchLostPointer`). */
  private lostPointerTargets: { canvas: HTMLElement; win: Window | null } | null = null;
  /** The popover of a change for the selection's tokens, made with the first one (`selectionResourceEntry`). */
  private selectionEditing: SelectionResourceEditing | null = null;
  /** Turns tokens on a Shift-drag, made with the first. */
  private turnDrag: TokenTurnDrag | null = null;

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
    if (activeTool === 'measure') {
      return;
    }

    e.stopPropagation();

    if (isSecondaryPress(e)) {
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      if (token && !this.isPlayerView) {
        this.showContextMenu(token, e);
      }
      return;
    }

    const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
    if (!token) return;
    if (this.isPlayerView) {
      return;
    }

    this.prepareInteraction(token, e);
  }

  /** Starts a group drag for the given token IDs (click within selection bounding box). */
  public handleViewportGroupDragStart(tokenIds: string[], e: FederatedPointerEvent): void {
    if (!isPrimaryPress(e)) return;

    const activeTool = this.store.getState().activeTool;
    if (activeTool !== 'select' && activeTool !== 'move') return;

    e.stopPropagation();

    if (this.isPlayerView || tokenIds.length === 0) {
      return;
    }

    // Use the first token as the reference for prepareInteraction (it will detect the multi-selection)
    const firstToken = mapTokens(levelObjects(this.store.getState()))[tokenIds[0]!];
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
      if (this.hoverPreview) this.eventBus.emit('pin-hide-preview', { pin: this.hoverPreview });
      this.hoverPreview = null;
    }

    this._currentHoverId = tokenId;

    if (tokenId) {
      this.handleHoverStart(tokenId);
      // Emit hover preview for new token
      const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
      // A token under the pointer may be dragged next: its speed is asked for ahead of the drag.
      if (token) this.movement?.prepare([token]);
      if (token?.kind === 'character' && e && token.statblockPath?.trim()) {
        this.hoverPreview = tokenPreviewAnchor(token, token.statblockPath);
        this.eventBus.emit('pin-hover-preview', {
          pin: this.hoverPreview,
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

  /** Shift and a drag on a token turn it. */
  public isTurningTokens(): boolean {
    return this.turnDrag?.turning ?? false;
  }

  private prepareInteraction(token: TokenEntity, e: FederatedPointerEvent): void {
    // A second pointer (another finger) pressing during a drag is not a new gesture: taking it
    // would let go of the held tokens and leave the drag's history transaction open.
    if (this.dragState.isDragging && this.dragState.hasMoved) return;

    const state = this.store.getState();
    const { selectedIds, setSelection } = state;
    const isTokenSelected = selectedIds.includes(token.id);
    // Shift, or Select more: the press adds the token to the selection or takes it out
    const more = picksMore(state, e);

    // Such a press toggles membership: a selected token leaves when the press is released in place,
    // since a drag moves the selection (with the switch) or turns it (with Shift).
    const leaves = more && isTokenSelected;

    this.viewport.plugins.pause('drag');
    
    // Clean up any existing listeners before attaching new ones
    // This prevents accumulation if previous interaction didn't clean up properly
    this.cleanupDragListeners();
    
    // A press without a hover before it (touch) asks for the grabbed token's speed here.
    this.movement?.prepare([token]);

    // Store the token for potential click handling
    this.dragState.clickToken = token;
    this.dragState.hasMoved = false;
    this.dragState.copyOnDrag = e.altKey && !e.shiftKey;
    this.dragState.turnsOnDrag = e.shiftKey;
    this.dragState.selectsOnRelease = false;
    this.dragState.deselectsOnRelease = leaves;
    
    // Determine which tokens to potentially drag
    if (leaves) {
      this.dragState.dragIds = [...selectedIds];
    } else if (more) {
      this.dragState.dragIds = [...selectedIds, token.id];
      setSelection(this.dragState.dragIds);
    } else if (isTokenSelected && selectedIds.length > 1) {
      this.dragState.dragIds = [...selectedIds];
    } else {
      this.dragState.dragIds = [token.id];
      this.dragState.selectsOnRelease = !isTokenSelected;
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
    // Tokens outside the selection stay at rest until release, so a drag never grows their UI
    this.reportHeld(this.dragState.dragIds.filter((id) => !selectedIds.includes(id)));
    
    // Don't set isDragging in store yet - wait for actual movement
    
    // Set up drag event listeners
    this.viewport.on('pointermove', this.onPointerMove, this);
    this.viewport.on('pointerup', this.onPointerUp, this);
    this.viewport.on('pointerupoutside', this.onPointerUp, this);
    this.watchLostPointer();
  }

  /**
   * No release follows a pointer the browser cancels or a press that outlasts the window's focus,
   * and PIXI reports neither. A press that outlasts the focus ends where the token is, as a drop.
   * A finger that is taken away (a second finger starts a pinch, a system gesture takes the touch)
   * was never let go: its tokens go back where they were taken from.
   */
  private watchLostPointer(): void {
    const canvas = this.viewport.options?.events?.domElement;
    if (!canvas) return;
    const win = canvas.ownerDocument.defaultView;
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    win?.addEventListener('blur', this.dropWhereItIs);
    this.lostPointerTargets = { canvas, win };
  }

  private readonly dropWhereItIs = (): void => {
    this.endDrag(this.dragState.lastPointer ?? this.dragState.dragStartPointer);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    // Copies made by an Alt-drag are in the scene already: a drop keeps the drag one step
    if (event.pointerType === 'touch' && !this.dragState.copyOnDrag) this.putBack();
    else this.dropWhereItIs();
  };

  /** Ends the press or drag as if it had never begun: the tokens stand where they were taken from, and no undo step is left. */
  private putBack(): void {
    if (!this.dragState.isDragging) return;
    if (this.dragState.turnsOnDrag && this.dragState.hasMoved) {
      this.endTurn(false);
      return;
    }
    const wasDrag = this.dragState.hasMoved;
    this.dragState.isDragging = false;
    this.cleanupDragListeners();
    if (this.dragState.animationFrameId) {
      window.cancelAnimationFrame(this.dragState.animationFrameId);
      delete this.dragState.animationFrameId;
    }
    if (wasDrag) {
      const back = this.dragState.dragIds.flatMap((id) => {
        const from = this.dragState.initialPositions[id];
        return from ? [{ id, x: from.x, y: from.y }] : [];
      });
      for (const { id, x, y } of back) {
        this.getTokenSprite?.(id)?.position.set(x, y);
        this.updateUIPosition?.(id, x, y);
      }
      this.store.getState().setIsDragging(false);
      if (back.length > 0) this.store.getState().setTokenPositions(back);
      abandonHistoryTransaction(this.store);
      this.onSelectionUpdate?.();
      this.updateHandlePositions?.();
    }
    this.dragRuler?.end();
    delete this.dragState.rulerTokenId;
    delete this.dragState.walls;
    delete this.dragState.current;
    this.viewport.plugins.resume('drag');
    this.dragState.pendingUpdate = false;
    this.dragState.hasMoved = false;
    delete this.dragState.clickToken;
    this.dragState.selectsOnRelease = false;
    this.dragState.deselectsOnRelease = false;
    this.reportHeld([]);
  }

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (!this.dragState.isDragging) return;
    
    const worldPos = this.viewport.toWorld(e.global);
    this.dragState.lastPointer = { x: worldPos.x, y: worldPos.y };
    const dx = worldPos.x - this.dragState.dragStartPointer.x;
    const dy = worldPos.y - this.dragState.dragStartPointer.y;
    
    // A move this far is a drag; a finger wanders further than a mouse before it means one
    const moveDistance = Math.sqrt(dx * dx + dy * dy);
    if (!this.dragState.hasMoved && moveDistance > tokenDragDistance(this.viewport, e)) {
      this.dragState.hasMoved = true;
      if (this.dragState.turnsOnDrag) this.beginTurn();
      else this.beginMove();
    }
    // If we haven't moved enough, don't update positions
    if (!this.dragState.hasMoved) return;
    if (this.dragState.turnsOnDrag) {
      this.turnDrag?.to(worldPos, e.altKey);
      return;
    }

    // Positions come from the pointer, not the sprites: an Alt-drag copy may still be loading its sprite.
    // In session view each token follows the pointer only up to the first wall in its way.
    const { walls, current = {} } = this.dragState;
    const state = this.store.getState();
    const updates = this.dragState.dragIds.flatMap((id) => {
      const initPos = this.dragState.initialPositions[id];
      if (!initPos) return [];
      const target = { x: initPos.x + dx, y: initPos.y + dy };
      const at = walls ? walls.follow(state, id, current[id] ?? initPos, target) : target;
      current[id] = at;
      return [{ id, x: at.x, y: at.y }];
    });

    for (const { id, x, y } of updates) {
      const sprite = this.getTokenSprite?.(id);
      if (!sprite) continue;
      sprite.position.set(x, y);
      this.updateUIPosition?.(id, x, y);
    }

    const rulerAt = this.dragState.rulerTokenId ? current[this.dragState.rulerTokenId] : undefined;
    if (rulerAt) this.dragRuler?.update(rulerAt);

    // The store follows the sprites on every move, so sight and a token's footprint in the dark
    // move with the token in the same frame (as Foundry ties a token's vision to where it is drawn);
    // a throttled store left the footprint trailing the sprite. Chromium sends one pointermove per
    // frame, so this is one write per frame.
    if (updates.length > 0) {
      // Sight waits for the drop when the scene has sight on drop on (`SightTokens`). Persistence
      // is debounced, and the open history transaction keeps these writes out of the undo stack.
      this.store.getState().setTokenPositions(updates);
    }
    
    // Schedule UI update
    if (!this.dragState.pendingUpdate && !this.dragState.animationFrameId) {
      this.dragState.pendingUpdate = true;
      this.dragState.animationFrameId = window.requestAnimationFrame(() => this.throttledUIUpdate());
    }
  };

  /** A drag past the threshold: the held tokens follow the pointer, as one undo step closed in `endDrag`. */
  private beginMove(): void {
    this.store.getState().setIsDragging(true);
    beginHistoryTransaction(this.store);
    const grabbedIndex = Math.max(0, this.dragState.dragIds.indexOf(this.dragState.clickToken?.id ?? ''));
    if (this.dragState.copyOnDrag) this.dragCopiesInstead();
    // Held are the tokens that move: the copies of an Alt-drag, before anything has moved.
    this.reportHeld(this.dragState.dragIds);
    this.startDragRuler(this.dragState.dragIds[grabbedIndex]);
    this.dragState.walls = sessionDragWalls(this.store.getState(), this.mapSize());
    this.dragState.current = {};
  }

  /** A Shift-drag past the threshold: the held tokens turn to look at the pointer, where they stand. */
  private beginTurn(): void {
    this.turnDrag ??= new TokenTurnDrag(this.viewport, this.store, () => cssColorToHexNumber(getObsidianAccentColor()));
    this.turnDrag.begin(this.dragState.dragIds.flatMap((id) => {
      const at = this.dragState.initialPositions[id];
      return at ? [{ id, at, diameter: this.getTokenSprite?.(id)?.tokenSize ?? 70 }] : [];
    }));
  }

  /** Ends a Shift-drag's turn: kept as one undo step, or turned back (`keep` false) with none. */
  private endTurn(keep: boolean): void {
    this.dragState.isDragging = false;
    if (keep) this.turnDrag?.end();
    else this.turnDrag?.cancel();
    this.cleanupDragListeners();
    this.viewport.plugins.resume('drag');
    this.dragState.hasMoved = false;
    this.dragState.turnsOnDrag = false;
    delete this.dragState.clickToken;
    this.dragState.selectsOnRelease = false;
    this.dragState.deselectsOnRelease = false;
    this.reportHeld([]);
  }

  /** The chevrons of a turn under way: the GM's alone (`markerLayers`). */
  public turnLayers(): Container[] {
    return this.turnDrag ? [this.turnDrag.layer] : [];
  }

  /** Swaps the drag over to fresh copies of the dragged tokens, which then become the selection. */
  private dragCopiesInstead(): void {
    const copies = copyDragSelection(this.store, this.dragState.dragIds, this.dragState.initialPositions, !this.dragState.selectsOnRelease);
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
          const tokenSize = sprite.tokenSize || 70;
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
    this.lostPointerTargets?.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.lostPointerTargets?.win?.removeEventListener('blur', this.dropWhereItIs);
    this.lostPointerTargets = null;
  }

  private onPointerUp = (e: FederatedPointerEvent): void => {
    this.endDrag(this.viewport.toWorld(e.global), { x: e.clientX, y: e.clientY, doc: this.viewport.options?.events?.domElement?.ownerDocument });
  };

  /**
   * Ends the press or drag with the pointer at `worldPos`: a drag drops its tokens there, as one undo
   * step. `menuAt` is where a choice of levels opens for tokens dropped into an elevator (none for a
   * pointer that was lost), whose pick joins that step.
   */
  private endDrag(worldPos: { x: number; y: number }, menuAt: StairsMenuPlace | null = null): void {
    if (!this.dragState.isDragging) return;
    if (this.dragState.turnsOnDrag && this.dragState.hasMoved) {
      this.endTurn(true);
      return;
    }
    const wasDrag = this.dragState.hasMoved;
    let stepHeld = false;

    try {
      this.dragState.isDragging = false;
      
      // Check if this was a click (no significant movement)
      if (!this.dragState.hasMoved && this.dragState.clickToken) {
        // A click selects a token the press found outside the selection
        const { id } = this.dragState.clickToken;
        if (this.dragState.selectsOnRelease) this.store.getState().setSelection([id]);
        else if (this.dragState.deselectsOnRelease) this.store.getState().setSelection(this.store.getState().selectedIds.filter((selected) => selected !== id));
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
      const state = this.store.getState();
      const snapToGrid = (state.grid?.snapToGrid ?? true) && toolSwitch(state, 'selectSnap');
      const tokens = mapTokens(levelObjects(state));
      const { walls, current = {} } = this.dragState;
      
      for (const id of this.dragState.dragIds) {
        const initPos = this.dragState.initialPositions[id];
        if (!initPos) continue;
        
        const newX = initPos.x + dx;
        const newY = initPos.y + dy;
        const size = tokens[id]?.size || 1;
        
        // In session view the token comes to rest before walls and snaps only to a place it reaches
        // (back where it was taken from when it reaches none); otherwise it snaps to the grid if enabled.
        const finalPos = walls
          ? walls.drop(state, { id, size, ...(current[id] ?? initPos) }, { x: newX, y: newY }) ?? initPos
          : snapToGrid
            ? this.gridSystem.snapTokenCenter(newX, newY, size)
            : { x: newX, y: newY };
        
        // The token, with its resource bars and nameplate, glides from the pointer to where it snaps
        this.settleToken?.(id, finalPos.x, finalPos.y);
        
        tokenUpdates.push({id, x: finalPos.x, y: finalPos.y});
      }
      
      // What each token moved counts for its turn, in the drop's own undo step.
      this.dragRuler?.countDrop(tokenUpdates.flatMap(({ id, x, y }) => {
        const from = this.dragState.initialPositions[id];
        return from ? [{ id, from, to: { x, y } }] : [];
      }));
      if (tokenUpdates.length > 0) stepHeld = dropTokensOnStairs(this.store, tokenUpdates, menuAt, this.artFloors?.());
      
      // Update UI
      this.onSelectionUpdate?.();
      
      // Update handle positions
      this.updateHandlePositions?.();
      
    } catch (error) {
      console.error('[InteractionController] Error in onPointerUp handler:', error);
    } finally {
      if (wasDrag && !stepHeld) endHistoryTransaction(this.store);
      this.dragRuler?.end();
      delete this.dragState.rulerTokenId;
      delete this.dragState.walls;
      delete this.dragState.current;

      // Always clean up event listeners to prevent accumulation
      this.cleanupDragListeners();

      // Always resume viewport drag
      this.viewport.plugins.resume('drag');

      // Reset drag state
      this.dragState.pendingUpdate = false;
      this.dragState.hasMoved = false;
      delete this.dragState.clickToken;
      this.dragState.selectsOnRelease = false;
      this.dragState.deselectsOnRelease = false;
      this.reportHeld([]);
    }
  }

  /** The store notes where the held tokens stand (`holdTokens`: sight waits there for the drop); then the token UI. */
  private reportHeld(tokenIds: string[]): void {
    holdTokens(this.store, tokenIds);
    this.onTokensHeldChange?.(tokenIds);
  }

  /** What this view gives the actions of a token (`tokenActions`). */
  private actionHost(): TokenActionHost {
    return {
      store: this.store,
      app: this.obsApp,
      grid: this.gridSystem,
      isPlayerView: this.isPlayerView,
      movement: this.movement,
      touch: deviceProfile().pointer === 'coarse',
      conditions: () => this.conditionDefsProvider?.() ?? [],
      resources: () => this.resourceDefsProvider(),
      editToken: (token) => this.showEditTokenModal(token),
      changeResource: (at, resourceName, count, apply) => this.openSelectionEditor(at, resourceName, count, apply),
      paste: () => pasteAtViewCentre(this.store, this.viewport),
      preview: (character, at) => this.eventBus.emit(OPEN_PREVIEW_EVENT, {
        pin: tokenPreviewAnchor(character, character.statblockPath ?? ''),
        screenX: at.x,
        screenY: at.y,
      }),
    };
  }

  /**
   * What can be done with the token and the selection it belongs to: the rows of its context menu
   * and the buttons of the bar above a selection. `at` is where the menu opens, in the window.
   */
  public tokenActions(tokenId: string, at: { x: number; y: number }): SelectionAction[] {
    const token = mapTokens(levelObjects(this.store.getState()))[tokenId];
    return token && !this.isPlayerView ? tokenActions(this.actionHost(), token, at) : [];
  }

  private showContextMenu(token: TokenEntity, e: FederatedPointerEvent): void {
    const at = { x: e.clientX, y: e.clientY };
    openContextMenuGlobal(selectionMenu(tokenActions(this.actionHost(), token, at), closeContextMenuGlobal), at);
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

  /** What the view draws of the levels' maps (`ArtFloors`): a token dropped where a level below shows falls to it. */
  setArtFloors(provider: (() => ArtFloors | undefined) | undefined): void {
    this.artFloors = provider;
  }

  /** The map's size in world pixels (`sessionDragWalls`). */
  setMapSize(read: () => MapSize | null): void {
    this.mapSize = read;
  }

  /** How a dropped token gets from where the pointer left it to its place. */
  setTokenSettler(settler: (tokenId: string, x: number, y: number) => void): void {
    this.settleToken = settler;
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

  setTokenMovement(movement: TokenMovement): void {
    this.movement = movement;
  }

  setDragRuler(ruler: DragRuler): void {
    this.dragRuler = ruler;
  }

  /** What a press on the bar of resource `key` changes: the selected tokens, two or more, and that resource. */
  private selectionOffer(key: string): SelectionResource & { targets: string[] } | null {
    if (this.isPlayerView) return null;
    const state = this.store.getState();
    const tokens = mapTokens(levelObjects(state));
    const targets = state.selectedIds.filter((id) => tokens[id] !== undefined);
    if (targets.length < 2) return null;
    const offered = selectionResources(tokens, targets, this.resourceDefsProvider()).find(({ definition }) => definition.key === key);
    return offered ? { targets, ...offered } : null;
  }

  /** Whether a press on the bar of resource `key` would change it for the selection. */
  public offersSelectionResource(key: string): boolean {
    return this.selectionOffer(key) !== null;
  }

  /**
   * A press on the bar of resource `key` of a token in a selection of two or more: the popover of
   * one change for every selected token that holds it. False where the press means nothing here.
   */
  public pressSelectionResource(key: string, at: { x: number; y: number }, onClose?: () => void): boolean {
    const offer = this.selectionOffer(key);
    if (!offer) return false;
    this.openSelectionEditor(at, offer.definition.name, offer.count, (amount) => (
      applySelectionResourceChange(this.store, offer.targets, this.resourceDefsProvider(), key, amount)
    ), onClose);
    return true;
  }

  private openSelectionEditor(
    at: { x: number; y: number }, resourceName: string, count: number, onCommit: (amount: number) => void, onClose?: () => void,
  ): void {
    this.selectionEditing ??= new SelectionResourceEditing(this.viewport.options.events.domElement);
    this.selectionEditing.open({ at, resourceName, count, onCommit, ...(onClose && { onClose }) });
  }

  private handleHoverStart(tokenId: string): void {
    // Hover start logic - could emit events or update UI
  }

  private handleHoverEnd(tokenId: string): void {
    // Hover end logic - could emit events or update UI
  }

  private showEditTokenModal(token: TokenEntity): void {
    const canvas = this.viewport.options?.events?.domElement;
    openEditTokenModal(token, this.store, this.obsApp, this.resourceDefsProvider(), canvas?.ownerDocument);
  }

  destroyAll(): void {
    // Clean up all hover handlers
    for (const tokenId in this.hoverHandlers) {
      delete this.hoverHandlers[tokenId];
    }

    // A drag interrupted by teardown must not leave its transaction open (a turn closes its own)
    const turning = this.turnDrag?.turning ?? false;
    this.turnDrag?.destroy();
    this.turnDrag = null;
    if (this.dragState.hasMoved && !turning) endHistoryTransaction(this.store);
    holdTokens(this.store, []);
    this.dragRuler?.end();
    this.selectionEditing?.close();

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

/** What a token's statblock preview is anchored to: the token, with the vitals the preview mirrors. */
function tokenPreviewAnchor(token: Extract<TokenEntity, { kind: 'character' }>, notePath: string): TokenPreviewAnchor {
  return {
    id: token.id,
    notePath,
    x: token.x,
    y: token.y,
    type: 'token',
    name: token.name,
    resources: token.resources,
    imagePath: token.imagePath,
    ringColor: token.ringColor,
    showRing: token.showRing,
  };
}
