import type { AtlasSettings } from '../services/SettingsService';
import { Container, Graphics, Text, TextStyle, type Ticker } from 'pixi.js';
import type { Character, BaseToken } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { barDimensions } from '../styles/designTokens';
import { TokenConditionsUI, type TokenConditionsLayout } from './token-renderer/TokenConditionsUI';
import { isNameplateVisible } from './token-renderer/nameplateVisibility';
import { tokenDisplayName } from './token-renderer/tokenDisplayName';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import { ResourceStack, type ResourceSlot } from './token-renderer/resources/ResourceStack';
import { ResourceWheels } from './token-renderer/resources/ResourceWheels';
import { wheelAnchor } from './token-renderer/resources/wheelAnchor';
import type { ResourceDefsProvider, ResourceViewer, VisibleResource } from '../resources/resourceTypes';
import { isDefeated, isSpent } from '../resources/resourceValues';
import { shapeOf, visibleResources } from '../resources/visibleResources';
import { destroyTree } from './utils/destroyTree';
import { computeTokenStrokeWidth, NAMEPLATE_HEIGHT, restingTokenUIScale, selectedTokenUIScale } from './token-renderer/tokenSizing';
import { getTokenRingCenterRadius } from './token-renderer/tokenRingMetrics';
import { ValueTransition } from './utils/ValueTransition';
import { MOTION_SLOW_MS, prefersReducedMotion } from '../utils/motion';
import { t } from '../i18n';

/**
 * Text is drawn at scale 0.333 and the viewport zooms to at most 5x, so a
 * resolution of 3 keeps glyphs crisp on HiDPI screens for a medium token without
 * rasterising every nameplate at eight times its size. Larger grids scale the
 * UI up, so its text resolution grows with it.
 */
const TEXT_RESOLUTION = 3;
const MAX_TEXT_RESOLUTION = 12;

/**
 * Every token's UI lies in one layer. A selected token's lies above the others,
 * so a neighbour never covers the bars and wheels being edited.
 */
const RESTING_Z_INDEX = 10;
const SELECTED_Z_INDEX = 11;

function textResolutionFor(uiScale: number): number {
  return Math.min(TEXT_RESOLUTION * Math.max(1, uiScale), MAX_TEXT_RESOLUTION);
}

export class TokenUIRenderer {
  private container: Container;
  /** `update` found a bar, nameplate or condition to show. */
  private hasContent = true;
  private hiddenWithToken = false;
  /** Bars and nameplate, anchored at the token's bottom edge and scaled with the token. */
  private belowToken: Container;
  /** Eases the UI between its resting scale (0) and a selected token's on-screen size (1). */
  private emphasis: ValueTransition;
  /** The resources of the bar slots, one view per resource. */
  private resources: ResourceStack;
  /** Anchor past the right resize button on the token's bottom edge (`wheelAnchor`), scaled like `belowToken`; holds the wheels of the right side. */
  private besideToken: Container;
  /** The mirror of `besideToken` past the left resize button; holds the wheels of the left side. */
  private leftOfToken: Container;
  /** The resources of the wheel slots, shown on hover and selection. */
  private wheels = new ResourceWheels();
  private difficultyBadge: Container;
  private difficultyText: Text;
  private defeatedOverlay: Graphics;
  private themeObserver: MutationObserver | null = null;
  private editThemeObserver: MutationObserver | null = null;
  private currentToken: (BaseToken & Partial<Character>) | null = null;
  private currentTokenSize: number = 0;
  private isHovered: boolean = false;
  private isSelected: boolean = false;
  /** The pointer is down on this token (a press or drag), which keeps its UI at rest. */
  private isHeld = false;
  /** Hovered without Cmd/Ctrl, which is reserved for the statblock preview. */
  private isPlainHover = false;
  private fadeAnimation: number | null = null;
  private store: StoreApi<ViewAtlasState> | undefined;
  private lastUpdateData: string = ''; // Cache for checking if update is needed
  private isHiddenDuringResize: boolean = false;
  private isHiddenDuringRotation: boolean = false;

  // Name badge elements
  private nameBadge: Graphics;
  private nameText: Text;
  
  // Inline editing state
  private isEditingName: boolean = false;
  private editInput: HTMLInputElement | null = null;
  private removeEditInputListeners: (() => void) | null = null;
  private originalName: string = '';
  private editCursor: Graphics;
  private cursorBlinkInterval: number | null = null;

  /** Condition badges on the token's ring and the card naming them on hover. */
  private conditionUI = new TokenConditionsUI();
  public conditionDefsProvider: (() => ConditionDefinition[]) | null = null;
  /** The resources of the map's collection, in the order they show. */
  public resourceDefsProvider: ResourceDefsProvider = () => [];
  /** Viewport zoom, for the constant on-screen size of a selected token's UI; none in the player view. */
  public zoomProvider: (() => number) | null = null;
  /** Receives every new UI scale, so the +/- controls can match the bars. */
  public onScaleChange: ((scale: number) => void) | null = null;
  

  /** Bar value changes animate on `ticker`, in step with the frames it renders. */
  constructor(store?: StoreApi<ViewAtlasState>, ticker: Ticker | null = null) {
    this.store = store;

    // The container sits at the token centre in world units; the UI itself lives in
    // anchors on the token's edges, laid out in UI units and scaled with the token.
    this.container = new Container();
    this.container.zIndex = RESTING_Z_INDEX;
    this.belowToken = new Container();
    this.belowToken.sortableChildren = true;
    this.besideToken = new Container();
    this.besideToken.addChild(this.wheels.right);
    this.leftOfToken = new Container();
    this.leftOfToken.addChild(this.wheels.left);
    // Conditions come last, so the hover card lies above this token's own bars and wheels
    this.container.addChild(this.belowToken, this.besideToken, this.leftOfToken, this.conditionUI.container);
    this.emphasis = new ValueTransition(0, MOTION_SLOW_MS, () => this.layoutUIScale());
    
    this.resources = new ResourceStack(ticker);
    this.resources.view.zIndex = 10; // Above the nameplate, below the defeated overlay

    // Create difficulty badge
    this.difficultyBadge = new Container();
    this.difficultyBadge.zIndex = 5; // Not used anymore but keeping for compatibility
    // Event mode not set - let events propagate naturally
    this.difficultyText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Arial',
        fontSize: 10,
        fill: 0xffffff,
        fontWeight: 'bold'
      }),
      resolution: TEXT_RESOLUTION,
    });
    // Event mode not set - let events propagate naturally
    
    // Create defeated overlay
    this.defeatedOverlay = new Graphics();
    this.defeatedOverlay.zIndex = 30; // Defeated overlay on top of everything
    // Event mode not set - let events propagate naturally
    
    // Create name badge elements
    this.nameBadge = new Graphics();
    this.nameBadge.zIndex = 1; // Name badge at very bottom
    this.nameBadge.eventMode = 'static'; // Make it interactive
    this.nameBadge.cursor = 'text'; // Show text cursor on hover
    
    this.nameText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
        fontSize: 24, // Base font size for 70px token
        fill: 0xffffff,
        fontWeight: '600'
        // No stroke for cleaner look in the badge.
      })
    });
    this.nameText.scale.set(0.333);
    this.nameText.resolution = TEXT_RESOLUTION;
    this.nameText.zIndex = 2; // Name text above name badge background
    
    // Add click handler to name badge
    this.nameBadge.on('pointerdown', (e) => {
      e.stopPropagation(); // Prevent token dragging
      this.startNameEdit();
    });
    
    // Create edit cursor (initially hidden)
    this.editCursor = new Graphics();
    this.editCursor.zIndex = 3; // Above name text
    this.editCursor.visible = false;
    
    // Add all elements below the token in the correct order (no sorting needed)
    this.belowToken.addChild(this.nameBadge); // z: 1 - name badge at bottom
    this.belowToken.addChild(this.nameText); // z: 2 - name text
    this.belowToken.addChild(this.editCursor); // z: 3 - edit cursor
    this.belowToken.addChild(this.resources.view); // z: 10
    this.belowToken.addChild(this.difficultyBadge); // z: 20
    this.belowToken.addChild(this.difficultyText); // z: 21
    this.belowToken.addChild(this.defeatedOverlay); // z: 30 - on top
    
    // Initially visible
    this.container.visible = true;
    this.container.alpha = 1;
    
    
    // Set up theme observer
    this.setupThemeObserver();

    this.setupGestureListeners();
  }

  private setupGestureListeners(): void {
    // Listen for token resize events to hide/show UI elements
    window.addEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.addEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
    // Listen for token rotation events to hide/show UI elements
    window.addEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.addEventListener('atlas-token-rotation-ended', this.onRotationEnded);
  }
  
  /**
   * Handle resize started events - hide UI elements except resize handles
   */
  private onResizeStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizingTokenIds = e.detail.tokenIds;
    
    // Only hide UI if this token is being resized
    if (this.currentToken && resizingTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringResize = true;
      
      // Hide resources and status badges during resize
      this.resources.view.visible = false;
      this.setWheelsVisible(false);
      this.nameBadge.visible = false;
      this.nameText.visible = false;
      this.conditionUI.setHidden(true);
    }
  };

  /**
   * Handle resize ended events - show UI elements again
   */
  private onResizeEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizedTokenIds = e.detail.tokenIds;
    
    // Only restore UI if this token was being resized
    if (this.currentToken && resizedTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringResize = false;
      
      // Force a re-render to show UI elements with correct visibility
      if (this.currentTokenSize > 0) {
        this.lastUpdateData = ''; // Clear cache to force update
        this.update(this.currentToken, this.currentTokenSize);
      }
    }
  };
  
  /**
   * Handle rotation started events - hide UI elements except rotation handles
   */
  private onRotationStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const rotatingTokenIds = e.detail.tokenIds;
    
    // Only hide UI if this token is being rotated
    if (this.currentToken && rotatingTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringRotation = true;
      
      // Hide resources and status badges during rotation
      this.resources.view.visible = false;
      this.setWheelsVisible(false);
      this.defeatedOverlay.visible = false;
      this.nameBadge.visible = false;
      this.nameText.visible = false;
      this.conditionUI.setHidden(true);
    }
  };
  
  /**
   * Handle rotation ended events - show UI elements again
   */
  private onRotationEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const rotatedTokenIds = e.detail.tokenIds;
    
    // Only restore UI if this token was being rotated
    if (this.currentToken && rotatedTokenIds.includes(this.currentToken.id)) {
      this.isHiddenDuringRotation = false;
      
      // Force a re-render to show UI elements with correct visibility
      if (this.currentTokenSize > 0) {
        this.lastUpdateData = ''; // Clear cache to force update
        this.update(this.currentToken, this.currentTokenSize);
      }
    }
  };
  
  private setupThemeObserver(): void {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    // Observe changes to the body class for theme switches
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Theme changed, force update to redraw with new colors
          if (this.currentToken && this.currentTokenSize > 0) {
            // Clear the cache to force redraw
            this.lastUpdateData = '';
            this.update(this.currentToken, this.currentTokenSize);
          }
        }
      }
    });
    
    // Start observing
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  
  /** Redraws the UI for `token`, whose sprite is `spriteWidth` world pixels wide. */
  public update(token: BaseToken & Partial<Character>, spriteWidth: number, playerSettings?: Pick<AtlasSettings['localPlayerView'], 'showTokenNameplates'>): void {
    const tokenSettings = this.store?.getState().tokenSettings;
    // Players see the resources their definitions allow, whatever the DM hides on this map.
    const viewer: ResourceViewer = playerSettings ? 'player' : 'dm';
    const definitions = this.resourceDefsProvider();
    // The map's own switches hide resources from the GM; the player view never reads them
    const hidden = playerSettings ? [] : tokenSettings?.hiddenResources ?? [];
    const shown = visibleResources(token, definitions, viewer).filter(({ definition }) => !hidden.includes(definition.key));

    const bars = shown.filter(({ slot }) => shapeOf(slot) === 'bar');
    // Wheels answer the game master's hover and selection; the player view has neither
    const wheels = playerSettings ? [] : shown.filter(({ slot }) => shapeOf(slot) === 'wheel');

    const resourcesKey = shown.map(({ definition, value, slot }) =>
      `${definition.key}:${slot}:${definition.name}:${definition.color}:${value.current}/${value.max}`).join('|');
    const showNameplate = playerSettings ? playerSettings.showTokenNameplates : isNameplateVisible(token, tokenSettings?.showNameplates ?? false);
    const conditionsKey = `${token.conditions?.join(',') ?? ''}${JSON.stringify(token.conditionValues ?? {})}`;
    const defeated = isDefeated(token, definitions);
    // The ring's size setting moves the resize buttons, and with them the wheels
    const ringScale = tokenSettings?.tokenRingSize ?? 1;
    const updateKey = `${resourcesKey}_${defeated}_${spriteWidth}_${ringScale}_${this.isHovered}_${this.isSelected}_${token.name || ''}_${showNameplate}_${token.statblockName || ''}_${conditionsKey}`;

    // Skip update if nothing has changed
    if (this.lastUpdateData === updateKey) {
      return;
    }

    this.lastUpdateData = updateKey;

    // Clear previous graphics
    this.difficultyBadge.removeChildren();
    this.defeatedOverlay.clear();
    this.nameBadge.clear();
    this.nameText.text = '';
    
    // Check if we have any data to display
    const hasResources = bars.length > 0 || wheels.length > 0;
    // showNameplate is already calculated above for change detection

    const hasConditions = (token.conditions?.length ?? 0) > 0;

    // Store current token data for theme updates
    this.currentToken = token;
    this.currentTokenSize = spriteWidth;

    // Anchor the UI on the token's edges; everything below is laid out from there in UI units
    this.belowToken.position.set(0, spriteWidth / 2);
    const anchor = this.wheelAnchor();
    this.besideToken.position.set(anchor.x, anchor.y);
    this.leftOfToken.position.set(-anchor.x, anchor.y);
    this.layoutUIScale();
    this.refreshConditions();
    this.conditionUI.setHidden(this.isHiddenDuringResize || this.isHiddenDuringRotation);

    // Before the early return: the controls lay out from the stack's slots, which must empty with it
    const baseGap = 2; // Gap between token and first bar
    this.resources.update(bars, baseGap, this.canAnimateValues());
    this.wheels.update(wheels);

    this.hasContent = hasResources || showNameplate || hasConditions;
    this.container.visible = this.hasContent && !this.hiddenWithToken;
    if (!this.hasContent) return;

    // A defeated token's first defeating bar is darkened
    const defeatedSlot = defeated ? this.defeatedSlot(shown) : undefined;
    if (defeatedSlot) {
      this.defeatedOverlay.roundRect(defeatedSlot.left, defeatedSlot.top, defeatedSlot.width, defeatedSlot.height, barDimensions.token.radius)
        .fill({ color: 0x000000, alpha: 0.4 });
    }

    // Name badge - only show if showNameplate is true AND there's a meaningful name
    const displayName = tokenDisplayName(token);

    // Only show nameplate if enabled AND we have a name to display
    if (showNameplate && displayName) {
      // Get theme colors
      const isDarkMode = document.body.classList.contains('theme-dark');
      const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
      const strokeColor = isDarkMode ? 0xffffff : 0x000000;
      
      this.nameText.text = displayName;
      // In PIXI v8, text updates automatically when setting the text property
      const textBounds = this.nameText.getLocalBounds();
      
      this.nameText.alpha = 0.85;
      
      // Badge dimensions - use fixed sizes  
      const scaledTextScale = 0.333; // Fixed text scale
      const scaledWidth = textBounds.width * scaledTextScale;
      const padding = 6; // Fixed padding
      const badgeWidth = Math.max(scaledWidth + padding * 2, 40); // Fixed min width
      const badgeHeight = NAMEPLATE_HEIGHT;
      const badgeRadius = badgeHeight / 2;
      
      // Position the name badge so its bottom edge aligns with the token's bottom edge
      const nameY = -badgeHeight / 2;
      
      // Draw rounded rectangle background
      this.nameBadge.clear();
      this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
        .fill({ color: bgColor, alpha: 1 }); // Fully opaque background
      
      // Add border — softened so it doesn't overpower the nameplate
      this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
        .stroke({ width: 0.5, color: strokeColor, alpha: isDarkMode ? 0.4 : 0.3 });
      
      // Position text in center of badge
      this.nameText.anchor.set(0.5, 0.5);
      this.nameText.position.set(0, nameY);
      this.nameText.scale.set(0.333); // Fixed text scale
    }
    
    // Hide unused elements (but respect resize and rotation hidden state)
    const isHidden = this.isHiddenDuringResize || this.isHiddenDuringRotation;
    this.resources.view.visible = bars.length > 0 && !isHidden;
    this.setWheelsVisible(!isHidden);
    this.difficultyBadge.visible = false; // Never show difficulty badge
    this.defeatedOverlay.visible = defeatedSlot !== undefined && !isHidden;
    const hasDisplayName = showNameplate && !!displayName;
    this.nameBadge.visible = hasDisplayName && !isHidden; // Only show if enabled, has name, and not hidden
    this.nameText.visible = hasDisplayName && !isHidden; // Only show if enabled, has name, and not hidden
  }
  
  /** The bar of the first shown resource whose spending defeated the token. */
  private defeatedSlot(shown: readonly VisibleResource[]): ResourceSlot | undefined {
    const key = shown.find(({ definition, value, slot }) => definition.defeatedWhenSpent && shapeOf(slot) === 'bar'
      && isSpent(definition, value))?.definition.key;
    return key === undefined ? undefined : this.resources.layout().find((slot) => slot.key === key);
  }

  /** Where each shown resource sits: bars in units of the bottom-edge anchor, wheels in units of their side's anchor. */
  public getResourceSlots(): readonly ResourceSlot[] {
    return [
      ...(this.resources.view.visible ? this.resources.layout() : []),
      ...(this.besideToken.visible ? this.wheels.layout() : []),
    ];
  }

  /**
   * How far this token's bars reach below it while it is selected, in world units; the
   * selection frame encloses them. The wheels stand outside the frame. Taken at the selected
   * size itself, not at the size the UI is still growing from, so the frame drawn when the
   * selection changes fits.
   */
  public getBarsReach(): number {
    const bars = this.resources.view.visible ? this.resources.layout() : [];
    return Math.max(0, ...bars.map((slot) => slot.top + slot.height)) * this.selectedScale();
  }

  private canAnimateValues(): boolean {
    return !prefersReducedMotion(document.body);
  }

  public getContainer(): Container {
    return this.container;
  }

  /** Current scale of the bars, nameplate and condition markers, including mid-transition. */
  public getUIScale(): number {
    return this.belowToken.scale.x;
  }

  /** Re-applies the UI scale after the viewport zoomed. */
  public refreshScale(): void {
    if (this.currentTokenSize <= 0) return;
    this.layoutUIScale();
    const { ringRadius, cardScale } = this.conditionsLayout();
    this.conditionUI.setCardScale(ringRadius, cardScale);
  }

  /** Redraws the condition badges from the current definitions, e.g. after an icon or colour was edited. */
  public refreshConditions(): void {
    if (!this.currentToken || this.currentTokenSize <= 0) return;
    this.conditionUI.update(this.currentToken, this.conditionDefsProvider?.() ?? [], this.conditionsLayout());
  }

  /**
   * Condition badges sit on the token's ring at the resting UI scale, whatever the
   * selection; the hover card keeps a constant screen size, like a tooltip.
   */
  private conditionsLayout(): TokenConditionsLayout {
    const badgeScale = restingTokenUIScale(this.store?.getState().grid?.size ?? 70);
    const zoom = this.zoomProvider?.();
    return { ringRadius: this.ringRadius(), badgeScale, cardScale: zoom ? 1 / zoom : badgeScale };
  }

  /** Radius of the middle of the token's ring, in world units. */
  private ringRadius(): number {
    const state = this.store?.getState();
    const ringScale = state?.tokenSettings?.tokenRingSize ?? 1;
    return getTokenRingCenterRadius(this.currentTokenSize * ringScale, computeTokenStrokeWidth(state?.grid?.size ?? 70), ringScale);
  }

  private wheelAnchor(): { x: number; y: number } {
    const state = this.store?.getState();
    return wheelAnchor(this.currentTokenSize, state?.grid?.size ?? 70, state?.tokenSettings?.tokenRingSize ?? 1);
  }

  /**
   * The canvas leaves the token out (hidden, or unseen by the players in session view): its UI
   * stays hidden through every `update`, until the token shows again.
   */
  public setHiddenWithToken(hidden: boolean): void {
    this.hiddenWithToken = hidden;
    this.container.visible = this.hasContent && !hidden;
  }

  /** Whether the UI has something to show: what the GM's view shows of it. */
  public get showsContent(): boolean {
    return this.hasContent;
  }

  /** Marks the pointer as down on this token; a held or dragged token keeps its UI at rest. */
  public setHeld(held: boolean): void {
    if (this.isHeld === held) return;
    this.isHeld = held;
    this.updateEmphasis();
    this.updateConditionCard();
  }

  /** Eases the UI to a selected token's on-screen size, or back to rest while unselected or held. */
  private updateEmphasis(): void {
    const target = this.isSelected && !this.isHeld ? 1 : 0;
    if (target === this.emphasis.targetValue) return;
    if (prefersReducedMotion(document.body)) this.emphasis.jumpTo(target);
    else this.emphasis.animateTo(target);
  }

  /** The scale of a selected token's UI: its constant size on screen, never below the resting size. */
  private selectedScale(): number {
    const resting = restingTokenUIScale(this.store?.getState().grid?.size ?? 70);
    const zoom = this.zoomProvider?.();
    return zoom ? selectedTokenUIScale(resting, zoom) : resting;
  }

  /**
   * Scales both anchors between `restingTokenUIScale` and `selectedTokenUIScale` by the
   * current emphasis. The selected size follows the zoom, so it is recomputed on every call.
   */
  private layoutUIScale(): void {
    const resting = restingTokenUIScale(this.store?.getState().grid?.size ?? 70);
    const scale = resting + (this.selectedScale() - resting) * this.emphasis.value;
    this.belowToken.scale.set(scale);
    this.besideToken.scale.set(scale);
    this.leftOfToken.scale.set(scale);
    // A selected token's text keeps a constant screen size, which the resting resolution covers
    this.setTextResolution(textResolutionFor(resting));
    this.onScaleChange?.(scale);
  }

  /** Re-rasterises the nameplate and bar numbers only when their resolution changes. */
  private setTextResolution(resolution: number): void {
    if (this.nameText.resolution !== resolution) this.nameText.resolution = resolution;
    this.resources.setResolution(resolution);
    this.wheels.setResolution(resolution);
  }
  
  public setVisibility(visible: boolean): void {
    this.container.visible = visible;
  }
  
  public setHoverState(hovered: boolean, modifierKeyDown = false): void {
    this.isHovered = hovered;
    this.updateTextVisibility();
    this.isPlainHover = hovered && !modifierKeyDown;
    this.updateConditionCard();
  }

  /** The conditions card is for looking at a token: selecting, pressing or dragging it hides the card. */
  private updateConditionCard(): void {
    this.conditionUI.setHovered(this.isPlainHover && !this.isSelected && !this.isHeld);
  }
  
  public setSelectionState(selected: boolean): void {
    if (this.isSelected === selected) return;
    this.isSelected = selected;
    this.container.zIndex = selected ? SELECTED_Z_INDEX : RESTING_Z_INDEX;
    this.updateEmphasis();
    this.updateConditionCard();
    this.updateTextVisibility();
  }
  
  /** Shows or hides the wheels of both sides, e.g. during a resize. */
  private setWheelsVisible(visible: boolean): void {
    this.besideToken.visible = visible;
    this.leftOfToken.visible = visible;
  }

  /** Bar numbers and wheels show together, on hover and selection. */
  private setRevealAlpha(alpha: number): void {
    this.resources.setTextAlpha(alpha);
    this.wheels.setAlpha(alpha);
  }

  private updateTextVisibility(): void {
    const shouldShowText = this.isHovered || this.isSelected;
    const targetAlpha = shouldShowText ? 1 : 0;
    
    // Cancel any existing animation
    if (this.fadeAnimation !== null) {
      window.cancelAnimationFrame(this.fadeAnimation);
      this.fadeAnimation = null;
    }
    
    // Animate the text alpha
    const animate = () => {
      const currentAlpha = this.resources.getTextAlpha();
      const diff = targetAlpha - currentAlpha;
      
      // If we're close enough, just set the final value
      if (Math.abs(diff) < 0.05) {
        this.setRevealAlpha(targetAlpha);
        this.fadeAnimation = null;
        return;
      }
      
      // Smooth animation with easing
      const step = diff * 0.15; // Adjust this value to control animation speed
      this.setRevealAlpha(currentAlpha + step);
      
      // Continue animation
      this.fadeAnimation = window.requestAnimationFrame(animate);
    };
    
    animate();
  }
  
  
  private setupTokenRing(): void {
    // Token ring setup functionality would go here
    // This method is not currently implemented
  }
  
  destroy(): void {
    // End any active editing
    this.endNameEdit();
    this.emphasis.cancel();
    this.resources.destroy();
    this.wheels.destroy();
    
    // Cancel any pending animation
    if (this.fadeAnimation !== null) {
      window.cancelAnimationFrame(this.fadeAnimation);
      this.fadeAnimation = null;
    }
    
    // Clean up theme observers
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    if (this.editThemeObserver) {
      this.editThemeObserver.disconnect();
      this.editThemeObserver = null;
    }
    
    // Clean up window listeners
    window.removeEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.removeEventListener('atlas-token-resize-ended', this.onResizeEnded);
    window.removeEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.removeEventListener('atlas-token-rotation-ended', this.onRotationEnded);
    
    this.conditionUI.destroy();

    // Clear references
    this.currentToken = null;
    this.currentTokenSize = 0;

    // Destroy container and children
    destroyTree(this.container);
  }
  
  /**
   * Start inline editing of the token name
   */
  public startNameEdit(): void {
    if (this.isEditingName || !this.currentToken || !this.store) return;
    
    // Only allow editing if nameplate is visible
    const mapShowsNameplates = this.store.getState().tokenSettings?.showNameplates ?? false;
    if (!isNameplateVisible(this.currentToken, mapShowsNameplates)) return;
    
    this.isEditingName = true;
    this.originalName = this.currentToken.name || '';
    
    // Keep the PIXI text visible
    this.nameText.visible = true;
    
    // Create a hidden HTML input to capture keyboard events
    const input = document.body.createEl('input');
    input.type = 'text';
    input.value = this.originalName || '';
    input.className = 'atlas-offscreen-input';
    input.setAttribute('tabindex', '-1');
    
    // Add the hidden input to capture keyboard events
    this.editInput = input;
    
    // Focus the hidden input to capture keyboard events
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    
    // Monitor for theme changes during editing
    if (typeof MutationObserver !== 'undefined') {
      if (this.editThemeObserver) {
        this.editThemeObserver.disconnect();
      }

      this.editThemeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && 
              (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
            // Theme or CSS variables might have changed, update colors
            window.setTimeout(updateNameBadgeAndCursor, 0);
          }
        });
      });
      
      // Observe changes to document root and body for theme changes
      this.editThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
      this.editThemeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
    
    // Function to get Obsidian's accent color
    const getAccentColor = () => {
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-h');
      const accentS = getComputedStyle(document.documentElement).getPropertyValue('--accent-s');
      const accentL = getComputedStyle(document.documentElement).getPropertyValue('--accent-l');
      
      let hexColor = 0x6366f1; // Default purple if CSS vars not available
      if (accentColor && accentS && accentL) {
        // Create HSL color string and convert to hex
        const hsl = `hsl(${accentColor}, ${accentS}, ${accentL})`;
        const tempDiv = document.body.createDiv();
        tempDiv.style.color = hsl;
        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        // Parse rgb() to hex
        const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          hexColor = (r << 16) | (g << 8) | b;
        }
      }
      return hexColor;
    };
    
    // Function to update both badge size and cursor position
    const updateNameBadgeAndCursor = () => {
      // Get theme colors (same as normal badge)
      const isDarkMode = document.body.classList.contains('theme-dark');
      const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
      const strokeColor = isDarkMode ? 0xffffff : 0x000000;
      
      // Get current text bounds
      const textBounds = this.nameText.getLocalBounds();
      
      // Badge dimensions (same as normal badge) - use fixed sizes
      const scaledTextScale = 0.333; // Fixed text scale
      const scaledTextWidth = textBounds.width * scaledTextScale;
      const padding = 6; // Fixed padding
      const badgeWidth = Math.max(scaledTextWidth + padding * 2, 40); // Fixed min width
      const badgeHeight = 14; // Fixed height
      const badgeRadius = badgeHeight / 2;
      
      // Get current name badge position
      const nameY = this.nameText.position.y;
      
      // Redraw the name badge with new size and editing glow
      this.nameBadge.clear();
      this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
        .fill({ color: bgColor, alpha: 1 }); // Fully opaque background
      
      // Add accent color stroke during editing
      if (this.isEditingName) {
        const accentColor = getAccentColor();
        
        // Single accent-colored stroke for editing highlight
        this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
          .stroke({ width: 1.5, color: accentColor, alpha: 0.8 });
      } else {
        // Normal subtle border when not editing
        this.nameBadge.roundRect(-badgeWidth/2, nameY - badgeHeight/2, badgeWidth, badgeHeight, badgeRadius)
          .stroke({ width: 0.5, color: strokeColor, alpha: isDarkMode ? 0.4 : 0.3 });
      }
      
      // Update cursor position based on actual cursor position in the input
      const textHeight = textBounds.height * scaledTextScale;
      
      // Calculate cursor position based on text cursor position
      const cursorPosition = this.editInput ? this.editInput.selectionStart || 0 : 0;
      const textBeforeCursor = this.nameText.text.substring(0, cursorPosition);
      
      // Create temporary text to measure width up to cursor
      const tempText = new Text({
        text: textBeforeCursor,
        style: this.nameText.style
      });
      // Use the scaledTextScale already defined above
      const textWidthToCursor = tempText.getLocalBounds().width * scaledTextScale;
      
      // Calculate cursor position
      const cursorX = this.nameText.x - (textBounds.width * scaledTextScale) / 2 + textWidthToCursor;
      const cursorY = this.nameText.y;
      
      // Clean up temporary text
      tempText.destroy();
      
      // Get cursor color using the accent color function
      const cursorColor = getAccentColor();
      
      // Draw cursor as rounded rectangle for proper rounded corners
      this.editCursor.clear();
      const cursorHeight = Math.max(textHeight, 12); // Fixed minimum cursor height
      const cursorWidth = 1.5; // Fixed width
      
      // Draw a rounded rectangle for the cursor
      this.editCursor.roundRect(
        cursorX - cursorWidth/2, 
        cursorY - cursorHeight/2, 
        cursorWidth, 
        cursorHeight, 
        cursorWidth/2 // Radius = half width for fully rounded ends
      ).fill({ color: cursorColor, alpha: 1 });
      
    };
    
    // Show and position cursor
    this.editCursor.visible = true;
    this.editCursor.alpha = 1; // Ensure it starts visible
    updateNameBadgeAndCursor();
    
    // Start blinking cursor
    let cursorVisible = true;
    this.cursorBlinkInterval = window.setInterval(() => {
      cursorVisible = !cursorVisible;
      this.editCursor.alpha = cursorVisible ? 1 : 0;
    }, 500);
    
    // Event handlers will be defined and attached later
    
    // Handle saving
    const saveEdit = () => {
      if (!this.isEditingName || !this.editInput || !this.currentToken || !this.store) return;
      
      const newName = this.editInput.value.trim();
      
      // Only update if name changed
      if (newName !== this.originalName) {
        this.store.getState().updateToken(this.currentToken.id, { name: newName === '' ? undefined : newName });
        
        // Force a re-render of this UI by clearing the cache
        this.lastUpdateData = '';
        
        // Update our local reference
        if (this.currentToken) {
          this.currentToken = { ...this.currentToken, name: newName };
        }
      }
      
      this.endNameEdit();
      
      // Force update to show the new name
      if (this.currentToken && this.currentTokenSize > 0) {
        this.update(this.currentToken, this.currentTokenSize);
      }
    };
    
    // Handle canceling
    const cancelEdit = () => {
      this.endNameEdit();
    };
    
    // Event handlers - be more careful about event handling
    const keydownHandler = (e: KeyboardEvent) => {
      // Only handle events if we're actually editing
      if (!this.isEditingName) return;
      
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        // Allow arrow keys and home/end for navigation - update cursor position after the event
        window.setTimeout(() => {
          updateNameBadgeAndCursor();
        }, 0);
      }
    };
    
    const blurHandler = () => {
      // Small delay to handle click events
      window.setTimeout(() => {
        if (this.isEditingName) {
          saveEdit();
        }
      }, 100);
    };
    
    const clickHandler = () => {
      updateNameBadgeAndCursor();
    };
    
    const keyupHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        updateNameBadgeAndCursor();
      }
    };
    
    const inputHandler = () => {
      const displayText = input.value || t('token.clickToName');
      this.nameText.text = displayText;
      // Set text opacity based on whether it's a placeholder (same as normal)
      this.nameText.alpha = input.value ? 0.6 : 0.3;
      // Update both badge size and cursor position after text change
      updateNameBadgeAndCursor();
    };
    
    input.addEventListener('keydown', keydownHandler);
    input.addEventListener('blur', blurHandler);
    input.addEventListener('click', clickHandler);
    input.addEventListener('keyup', keyupHandler);
    input.addEventListener('input', inputHandler);
    
    // Store handlers for cleanup
    this.removeEditInputListeners = (): void => {
      input.removeEventListener('keydown', keydownHandler);
      input.removeEventListener('blur', blurHandler);
      input.removeEventListener('click', clickHandler);
      input.removeEventListener('keyup', keyupHandler);
      input.removeEventListener('input', inputHandler);
    };
  }
  
  /**
   * End inline editing of the token name
   */
  private endNameEdit(): void {
    if (!this.isEditingName) return;
    
    this.isEditingName = false;
    
    // Hide cursor
    this.editCursor.visible = false;
    
    // Stop cursor blinking
    if (this.cursorBlinkInterval !== null) {
      window.clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = null;
    }
    
    // Remove input element with proper cleanup
    if (this.editInput) {
      this.removeEditInputListeners?.();
      this.removeEditInputListeners = null;
      
      // Remove from DOM
      this.editInput.remove();
      this.editInput = null;
    }
    
    // Stop editing observer only; keep base theme observer active
    if (this.editThemeObserver) {
      this.editThemeObserver.disconnect();
      this.editThemeObserver = null;
    }
    
    // Redraw the name badge without glow effect
    if (this.currentToken && this.currentTokenSize > 0) {
      // Force update to remove glow effect
      this.lastUpdateData = '';
      this.update(this.currentToken, this.currentTokenSize);
    }
    
    // Name text is already visible, no need to show it again
  }
}
