import { Container, Graphics, Texture, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Character } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import type { TokenUpdates } from '../types/viewState';
import type { StoreApi } from 'zustand';
import { colors, barDimensions } from '../styles/designTokens';
import { toError } from '../utils/errors';
import type { TokenGestureEventDetail } from '../types/atlasWindowEvents';
import { openResourceEditor, type BarAnchor, type ResourceEditor, type ResourceValue } from './tokenValueEditor';
import { ResourceBarHitArea } from './ResourceBarHitArea';
import { destroyTree } from './utils/destroyTree';
import type { ResourceSlot } from './token-renderer/resources/ResourceStack';
import { WHEEL_STEPPER } from './token-renderer/resources/ResourceWheels';
import { wheelAnchor } from './token-renderer/resources/wheelAnchor';
import { colorNumber } from './token-renderer/resources/ResourceBarView';
import type { ResourceDefinition, ResourceDefsProvider } from '../resources/resourceTypes';
import { resourceUpdate, withCurrent } from '../resources/resourceValues';
import { visibleResources } from '../resources/visibleResources';

type ControlIconType = 'plus' | 'minus';

/** The click-to-edit overlay and the +/- buttons of one resource. */
/** Diameter of a +/- button, in UI units: a bar's height. */
const BUTTON_SIZE = 10;

interface ResourceControl {
  hit: ResourceBarHitArea;
  minus: ControlButton;
  plus: ControlButton;
}

/** Round +/- button; keeps what `drawButtonState` needs to redraw it. */
interface ControlButton extends Container {
  bg: Graphics;
  iconType: ControlIconType;
  iconColor: number;
}

/** Token UI layer: above every token (zIndex 0), so a neighbour never covers a selected token's controls. */
export const TOKEN_UI_Z_INDEX = 100;

export class TokenControlsUI {
  private container: Container;
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private currentTokenId: string | null = null;
  private buttons: ControlButton[] = [];
  private isHiddenDuringResize: boolean = false;
  private isHiddenDuringRotation: boolean = false;
  private isDestroyed: boolean = false;

  /** Controls per resource key, created when the resource first shows and reused after. */
  private resourceControls = new Map<string, ResourceControl>();
  private editor: ResourceEditor | null = null;
  private followEditor: (() => void) | null = null;
  /** The resources of the map's collection, in the order they show. */
  public resourceDefsProvider: ResourceDefsProvider = () => [];
  /** Where a token's resources are drawn, from its `TokenUIRenderer`, so each control sits on its resource. */
  public slotsProvider: (tokenId: string) => readonly ResourceSlot[] = () => [];

  private readonly DANGER_COLOR = colors.health.critical;

  // Icon SVG definitions (Lucide React Plus and Minus icons)
  private readonly ICON_SVGS = {
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"/>
      <path d="M12 5v14"/>
    </svg>`,
    minus: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"/>
    </svg>`
  };
  
  /** The token UI's anchors again, scaled like them: below the token for bars, `wheelAnchor` and its mirror on the left for wheels. Controls live in the anchor of what they edit. */
  private readonly below = new Container();
  private readonly beside = new Container();
  private readonly leftOf = new Container();

  // Texture cache for icons
  private iconTextureCache: Map<string, Texture> = new Map();
  
  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;
    
    // Create main container
    this.container = new Container();
    this.container.visible = false;
    this.container.eventMode = 'passive'; // Allow events to pass through to tokens
    this.container.sortableChildren = true;
    this.container.zIndex = TOKEN_UI_Z_INDEX;
    this.container.addChild(this.below, this.beside, this.leftOf);

    // Don't stop propagation at container level - let individual buttons handle it
    
    // The icons load asynchronously; buttons created before then are redrawn with them
    this.initializeIconTextures().then(() => {
      if (this.isDestroyed) return;
      for (const button of this.buttons) {
        if (!button.destroyed) this.drawButtonState(button, false);
      }
    }).catch(err => {
      console.error('[TokenControlsUI] Failed to initialize textures:', err);
    });

    // Add to viewport
    this.viewport.addChild(this.container);
    
    // Listen for resize events to hide/show controls
    window.addEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.addEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
    // Listen for rotation events to hide/show controls
    window.addEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.addEventListener('atlas-token-rotation-ended', this.onRotationEnded);
  }
  
  private async initializeIconTextures(): Promise<void> {
    // One white texture per icon; each button tints it with its colour
    const svgSize = 48; // Match status badge icon size

    for (const [iconType, svgTemplate] of Object.entries(this.ICON_SVGS)) {
      const svg = svgTemplate.replace(/currentColor/g, '#ffffff');
      const canvas = createEl('canvas');
      canvas.width = svgSize;
      canvas.height = svgSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, svgSize, svgSize);
            this.iconTextureCache.set(iconType, Texture.from(canvas));
            resolve();
          } catch (err) {
            console.error(`[TokenControlsUI] Failed to create texture for ${iconType}:`, err);
            reject(toError(err, 'Failed to build icon texture'));
          }
        };
        img.onerror = (err) => {
          console.error(`[TokenControlsUI] Failed to load SVG for ${iconType}:`, err);
          reject(toError(err, 'Failed to build icon texture'));
        };
        img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      });
    }
  }

  private createButton(iconType: ControlIconType, iconColor: number): ControlButton {
    const bg = new Graphics();
    const button: ControlButton = Object.assign(new Container(), { bg, iconType, iconColor });
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.addChild(bg);
    
    // Draw initial state
    this.drawButtonState(button, false);
    
    // Add hover handlers
    button.on('pointerover', () => this.drawButtonState(button, true));
    button.on('pointerout', () => this.drawButtonState(button, false));
    
    this.buttons.push(button);
    return button;
  }
  
  /** Wires a resource overlay so clicking it opens the popover for `value` under that resource. */
  private bindEditor(hit: ResourceBarHitArea, slot: ResourceSlot, value: ResourceValue, resourceLabel: string, onCommit: (next: ResourceValue) => void): void {
    hit.layout(slot);
    hit.on('pointerdown', (e) => {
      e.preventDefault(); // Keep the canvas's default focus from stealing the popover's focus.
      e.stopPropagation();
      this.openEditor(hit, slot, value, resourceLabel, onCommit);
    });
  }

  private openEditor(hit: ResourceBarHitArea, slot: ResourceSlot, value: ResourceValue, resourceLabel: string, onCommit: (next: ResourceValue) => void): void {
    this.editor?.close();
    hit.setActive(true);
    const follow = (): void => this.editor?.reposition(this.slotAnchor(slot));
    this.followEditor = follow;
    this.viewport.on('moved', follow);
    this.viewport.on('zoomed', follow);
    this.editor = openResourceEditor({
      anchorEl: this.viewport.options.events.domElement,
      anchor: this.slotAnchor(slot),
      value,
      resourceLabel,
      onCommit,
      onClose: () => {
        this.viewport.off('moved', follow);
        this.viewport.off('zoomed', follow);
        this.editor = null;
        this.followEditor = null;
        if (!hit.destroyed) hit.setActive(false);
      },
    });
  }

  /** Screen-space anchor of the resource drawn in `slot`, in canvas-local pixels. */
  private slotAnchor(slot: ResourceSlot): BarAnchor {
    const anchor = this.anchorOf(slot);
    const topLeft = anchor.toGlobal({ x: slot.left, y: slot.top });
    const bottomRight = anchor.toGlobal({ x: slot.left + slot.width, y: slot.top + slot.height });
    return { x: (topLeft.x + bottomRight.x) / 2, top: topLeft.y, bottom: bottomRight.y };
  }

  private drawButtonState(button: ControlButton, isHover: boolean): void {
    const { bg, iconType, iconColor } = button;
    
    // The icon textures load asynchronously, so a redraw can arrive after destroy
    if (bg.destroyed) {
      console.warn('[TokenControlsUI] drawButtonState called with invalid bg Graphics');
      return;
    }
    
    bg.clear();
    
    // Get theme colors
    const isDarkMode = document.body.classList.contains('theme-dark');
    const bgColor = isDarkMode ? 0x2a2a2a : 0xe3e3e3;
    const strokeColor = isDarkMode ? 0xffffff : 0x000000;
    const strokeAlpha = isDarkMode ? 0.4 : 0.3;
    
    // Draw background - circular like status badges
    const size = BUTTON_SIZE;
    const radius = size / 2;
    
    // Background fill
    bg.fill({ color: bgColor, alpha: 1 });
    bg.circle(0, 0, radius);
    bg.fill();
    
    // Stroke with proper line style - thinner like status badges
    bg.setStrokeStyle({ width: 0.5, color: strokeColor, alpha: isHover ? strokeAlpha * 1.5 : strokeAlpha });
    bg.stroke();
    bg.circle(0, 0, radius);
    bg.stroke();
    
    // Remove old icon if exists
    while (button.children.length > 1) {
      const oldIcon = button.removeChildAt(1);
      if (oldIcon instanceof Sprite) {
        oldIcon.destroy();
      }
    }
    
    // Add the icon, tinted with the button's colour
    const iconTexture = this.iconTextureCache.get(iconType);

    if (iconTexture) {
      const iconSprite = new Sprite(iconTexture);
      iconSprite.tint = iconColor;
      iconSprite.anchor.set(0.5);
      iconSprite.scale.set(size * 0.5 / 48); // Scale from 48px SVG to fit button
      iconSprite.position.set(0, 0);
      iconSprite.alpha = 1;
      button.addChild(iconSprite);
    }
  }
  
  /** Shows the controls of a token whose bars and wheels are drawn at `uiScale`. */
  public show(tokenId: string, worldX: number, worldY: number, tokenSize: number, uiScale: number): void {
    const state = this.store.getState();
    const token = state.objects.tokens[tokenId] as Character | undefined;
    
    if (!token || this.slotsProvider(tokenId).length === 0) {
      this.hide();
      return;
    }
    
    this.currentTokenId = tokenId;
    this.place(worldX, worldY, tokenSize);
    this.setScale(uiScale);

    // Update button visibility and handlers
    this.updateButtons(token);
    
    // Make container visible (unless hidden during resize or rotation)
    this.container.visible = !this.isHiddenDuringResize && !this.isHiddenDuringRotation;
  }
  
  public hide(): void {
    this.currentTokenId = null;
    this.container.visible = false;
    this.editor?.close();
    for (const control of this.resourceControls.values()) this.hideControl(control);
  }

  public updatePosition(worldX: number, worldY: number, tokenSize: number): void {
    if (!this.isVisible) return;
    
    this.place(worldX, worldY, tokenSize);
    this.followEditor?.();
  }

  /** Lays the controls out for `tokenId`'s new size, also while a resize gesture hides them. */
  public followTokenSize(tokenId: string, worldX: number, worldY: number, tokenSize: number): void {
    if (tokenId !== this.currentTokenId) return;
    this.place(worldX, worldY, tokenSize);
    this.followEditor?.();
  }

  /** Matches the controls to the scale of `tokenId`'s bars as it changes. */
  public setScaleFor(tokenId: string, uiScale: number): void {
    if (tokenId !== this.currentTokenId) return;
    this.setScale(uiScale);
    this.followEditor?.();
  }

  private get isVisible(): boolean {
    return this.container.visible;
  }

  /** Puts the anchors where the token UI has its own: below the token centred at (`worldX`, `worldY`), and where its wheels hang. */
  private place(worldX: number, worldY: number, tokenSize: number): void {
    const { grid, tokenSettings } = this.store.getState();
    const beside = wheelAnchor(tokenSize, grid?.size ?? 70, tokenSettings?.tokenRingSize ?? 1);
    this.container.position.set(worldX, worldY);
    this.below.position.set(0, tokenSize / 2);
    this.beside.position.set(beside.x, beside.y);
    this.leftOf.position.set(-beside.x, beside.y);
  }

  private setScale(uiScale: number): void {
    this.below.scale.set(uiScale);
    this.beside.scale.set(uiScale);
    this.leftOf.scale.set(uiScale);
  }

  /** A bar's controls hang from the token's bottom edge, a wheel's from the anchor of its side. */
  private anchorOf(slot: ResourceSlot): Container {
    return { bar: this.below, wheel: this.beside, 'wheel-left': this.leftOf }[slot.kind];
  }

  private updateButtons(token: Character): void {
    for (const control of this.resourceControls.values()) this.hideControl(control);
    if (!this.currentTokenId) return;

    // Same resources and places as TokenUIRenderer drew them, so each overlay sits on its resource
    const slots = this.slotsProvider(this.currentTokenId);
    for (const { definition, value } of visibleResources(token, this.resourceDefsProvider(), 'dm')) {
      // A static value does not change in play: its number is set in Edit Token
      if (definition.direction === 'static') continue;
      const slot = slots.find((candidate) => candidate.key === definition.key);
      if (!slot) continue;
      // The token may have changed since the controls were shown (dashboard, Kill, Edit Token), so
      // every edit starts from the stored token: it must not write old values over other resources.
      const edit = (change: (stored: ResourceValue) => ResourceValue): void => {
        const live = this.currentTokenId ? this.store.getState().objects.tokens[this.currentTokenId] : undefined;
        const stored = live?.resources?.[definition.key];
        if (!live || !stored) return;
        const next = change(stored);
        this.setTokenValue(resourceUpdate(live, definition.key, next, next.max !== stored.max));
      };
      this.bindResource(this.controlFor(definition), slot, value, definition.name,
        (delta) => edit((stored) => withCurrent(stored, stored.current + delta)),
        (next) => edit(() => next));
    }
  }

  /** The controls of `definition`, in its colour; created once per resource key. */
  private controlFor(definition: ResourceDefinition): ResourceControl {
    const color = colorNumber(definition.color);
    let control = this.resourceControls.get(definition.key);
    if (!control) {
      control = {
        hit: new ResourceBarHitArea(color),
        minus: this.createButton('minus', this.DANGER_COLOR),
        plus: this.createButton('plus', color),
      };
      this.resourceControls.set(definition.key, control);
    }
    control.plus.iconColor = color;
    return control;
  }

  /** Shows one resource's +/- buttons beside it and its click-to-edit overlay on top of it. */
  private bindResource(
    { hit, minus, plus }: ResourceControl, slot: ResourceSlot,
    value: ResourceValue, resourceLabel: string, onDelta: (delta: number) => void, onCommit: (next: ResourceValue) => void,
  ): void {
    // Reordering the collection's resources can move one between bar and wheel, so the anchor is chosen here
    this.anchorOf(slot).addChild(hit, minus, plus);
    const centerY = slot.top + slot.height / 2;
    const right = slot.left + slot.width;
    // A wheel's stepper stands on its outer side, away from the token: + above -
    const stepperX = slot.kind === 'wheel-left'
      ? slot.left - WHEEL_STEPPER.gap - WHEEL_STEPPER.size / 2
      : right + WHEEL_STEPPER.gap + WHEEL_STEPPER.size / 2;
    const positions = slot.kind !== 'bar'
      ? [[minus, -1, stepperX, centerY + (WHEEL_STEPPER.size + 1) / 2],
        [plus, 1, stepperX, centerY - (WHEEL_STEPPER.size + 1) / 2]] as const
      : [[minus, -1, slot.left - BUTTON_SIZE / 2 - barDimensions.token.gap, centerY],
        [plus, 1, right + BUTTON_SIZE / 2 + barDimensions.token.gap, centerY]] as const;
    for (const [button, delta, x, y] of positions) {
      button.visible = true;
      this.drawButtonState(button, false);
      button.position.set(x, y);
      button.on('pointerdown', (e) => {
        e.stopPropagation();
        onDelta(delta);
      });
    }
    this.bindEditor(hit, slot, value, resourceLabel, onCommit);
  }

  private hideControl({ hit, minus, plus }: ResourceControl): void {
    for (const part of [hit, minus, plus]) part.removeAllListeners('pointerdown');
    minus.visible = false;
    plus.visible = false;
    hit.hide();
  }

  /** Writes the update to the store and re-lays out controls from the fresh token. */
  private setTokenValue(updates: TokenUpdates): void {
    if (!this.currentTokenId) return;
    this.store.getState().updateToken(this.currentTokenId, updates);
    const updatedToken = this.store.getState().objects.tokens[this.currentTokenId] as Character | undefined;
    if (updatedToken) {
      this.updateButtons(updatedToken);
    }
  }
  
  /**
   * Handle resize started events - hide controls
   */
  private onResizeStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizingTokenIds = e.detail.tokenIds;
    
    // Only hide controls if this token is being resized
    if (this.currentTokenId && resizingTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringResize = true;
      this.container.visible = false;
    }
  };
  
  /**
   * Handle resize ended events - show controls if they should be visible
   */
  private onResizeEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const resizedTokenIds = e.detail.tokenIds;
    
    // Only restore controls if this token was being resized
    if (this.currentTokenId && resizedTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringResize = false;
      // Restore visibility if not hidden by other operations
      if (!this.isHiddenDuringRotation) {
        this.container.visible = true;
      }
    }
  };
  
  /**
   * Handle rotation started events - hide controls
   */
  private onRotationStarted = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const rotatingTokenIds = e.detail.tokenIds;
    
    // Only hide controls if this token is being rotated
    if (this.currentTokenId && rotatingTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringRotation = true;
      this.container.visible = false;
    }
  };
  
  /**
   * Handle rotation ended events - show controls if they should be visible
   */
  private onRotationEnded = (e: CustomEvent<TokenGestureEventDetail>): void => {
    const rotatedTokenIds = e.detail.tokenIds;
    
    // Only restore controls if this token was being rotated
    if (this.currentTokenId && rotatedTokenIds.includes(this.currentTokenId)) {
      this.isHiddenDuringRotation = false;
      // Restore visibility if not hidden by other operations
      if (!this.isHiddenDuringResize) {
        this.container.visible = true;
      }
    }
  };
  
  public getContainer(): Container {
    return this.container;
  }

  public destroy(): void {
    // Mark as destroyed to prevent async operations
    this.isDestroyed = true;
    
    // Remove resize event listeners
    window.removeEventListener('atlas-token-resize-started', this.onResizeStarted);
    window.removeEventListener('atlas-token-resize-ended', this.onResizeEnded);
    
    // Remove rotation event listeners
    window.removeEventListener('atlas-token-rotation-started', this.onRotationStarted);
    window.removeEventListener('atlas-token-rotation-ended', this.onRotationEnded);
    
    this.editor?.close();

    // Remove all listeners
    this.buttons.forEach(btn => {
      btn.removeAllListeners();
    });
    
    // Clear texture cache
    this.iconTextureCache.clear();
    
    // Destroy graphics
    destroyTree(this.container);
  }
}
