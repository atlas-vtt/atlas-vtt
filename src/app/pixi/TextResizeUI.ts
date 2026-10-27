/**
 * Text Resize UI
 * 
 * Provides resize handles for text elements, similar to token resize.
 */

import { Container, Graphics, Sprite, Texture, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { TextElement } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { levelObjects } from '../levels/levelObjects';

/** Resting look of a resize handle: a dark pill with a faint outlined inset. */
function drawIdleHandleBackground(bg: Graphics): void {
  bg.roundRect(-12, -20, 24, 40, 8).fill({ color: 0x000000, alpha: 0.8 });
  bg.roundRect(-11, -19, 22, 38, 7)
    .fill({ color: 0xFFFFFF, alpha: 0.2 })
    .stroke({ width: 1, color: 0xFFFFFF, alpha: 0.8 });
}

export class TextResizeUI {
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private container: Container;
  private leftHandle: Container;
  private rightHandle: Container;
  private activeTextId: string | null = null;
  private isDragging: boolean = false;
  private draggedHandle: 'left' | 'right' | null = null;
  private temporaryScale: number = 1;
  
  // Drag state
  private dragStartX: number = 0;
  private textStartScale: number = 1;
  private initialDistance: number = 0;

  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;
    
    // Create container for UI elements
    this.container = new Container();
    this.container.label = 'textResizeUI';
    this.container.zIndex = MAP_LAYER_Z.textHandles;
    this.container.visible = false;
    this.viewport.addChild(this.container);
    
    // Create resize handles
    this.leftHandle = this.createHandle('left');
    this.rightHandle = this.createHandle('right');
    
    this.container.addChild(this.leftHandle);
    this.container.addChild(this.rightHandle);
  }

  private createHandle(side: 'left' | 'right'): Container {
    const handle = new Container();
    handle.label = `resizeHandle_${side}`;
    
    // Create handle background
    const bg = new Graphics();
    drawIdleHandleBackground(bg);
    handle.addChild(bg);
    
    // Create chevron icon
    const iconTexture = this.createChevronIcon(side);
    const icon = new Sprite(iconTexture);
    icon.anchor.set(0.5);
    icon.scale.set(0.6);
    handle.addChild(icon);
    
    // Set up interaction
    handle.eventMode = 'static';
    handle.cursor = 'ew-resize';
    handle.on('pointerdown', (e) => this.onHandlePointerDown(e, side));
    
    // Add hover effect
    handle.on('pointerover', () => {
      bg.clear();
      bg.roundRect(-12, -20, 24, 40, 8).fill({ color: 0x00FFFF, alpha: 0.9 });
    });
    
    handle.on('pointerout', () => {
      if (!this.isDragging) {
        bg.clear();
        drawIdleHandleBackground(bg);
      }
    });
    
    return handle;
  }

  private createChevronIcon(side: 'left' | 'right'): Texture {
    // Create texture using canvas to avoid renderer dependency
    const canvas = createEl('canvas');
    const size = 32; // Increased size for better visibility
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return Texture.WHITE;
    }
    
    // Center the drawing
    ctx.translate(size / 2, size / 2);
    
    // Draw chevron
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(size / 6, -size / 6);
      ctx.lineTo(-size / 6, 0);
      ctx.lineTo(size / 6, size / 6);
    } else {
      ctx.moveTo(-size / 6, -size / 6);
      ctx.lineTo(size / 6, 0);
      ctx.lineTo(-size / 6, size / 6);
    }
    ctx.stroke();
    
    return Texture.from(canvas);
  }

  show(textElement: TextElement): void {
    this.activeTextId = textElement.id;
    this.container.visible = true;
    this.temporaryScale = textElement.scale || 1;
    this.updateHandlePositions(textElement);
  }

  hide(): void {
    this.container.visible = false;
    this.activeTextId = null;
    this.isDragging = false;
  }

  updatePosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  private updateHandlePositions(textElement: TextElement): void {
    const textContainer = this.viewport.children.find(
      child => child.label === 'textContainer'
    )?.children.find(
      child => child.label === textElement.id
    );
    
    if (!textContainer) return;
    
    // Get text bounds
    const bounds = textContainer.getLocalBounds();
    const scale = textElement.scale || 1;
    const halfWidth = (bounds.width * scale) / 2;
    const padding = 30; // Distance from text
    
    // Position handles on left and right
    this.leftHandle.position.set(-(halfWidth + padding), 0);
    this.rightHandle.position.set(halfWidth + padding, 0);
    
    // Apply text rotation to handles container
    this.container.rotation = textElement.rotation ? (textElement.rotation * Math.PI) / 180 : 0;
  }

  private onHandlePointerDown(e: FederatedPointerEvent, side: 'left' | 'right'): void {
    if (!this.activeTextId) return;
    
    e.stopPropagation();
    this.isDragging = true;
    this.draggedHandle = side;
    
    const textElement = levelObjects(this.store.getState()).texts[this.activeTextId];
    if (!textElement) return;
    
    const worldPos = this.viewport.toWorld(e.global);
    this.dragStartX = worldPos.x;
    this.textStartScale = textElement.scale || 1;
    
    // Calculate initial distance from center
    const dx = worldPos.x - textElement.x;
    const dy = worldPos.y - textElement.y;
    this.initialDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Set up drag listeners
    this.viewport.on('pointermove', this.onPointerMove, this);
    this.viewport.on('pointerup', this.onPointerUp, this);
    this.viewport.on('pointerupoutside', this.onPointerUp, this);
  }

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.isDragging || !this.activeTextId || !this.draggedHandle) return;
    
    const textElement = levelObjects(this.store.getState()).texts[this.activeTextId];
    if (!textElement) return;
    
    const worldPos = this.viewport.toWorld(e.global);
    
    // Calculate current distance from center
    const dx = worldPos.x - textElement.x;
    const dy = worldPos.y - textElement.y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate scale change
    const scaleRatio = currentDistance / this.initialDistance;
    let newScale = this.textStartScale * scaleRatio;
    
    // Clamp scale
    newScale = Math.max(0.2, Math.min(5, newScale));
    
    // Snap to 0.1 increments if shift is held
    if (e.shiftKey) {
      newScale = Math.round(newScale * 10) / 10;
    }
    
    this.temporaryScale = newScale;
    
    // Update visual scale
    const textContainer = this.viewport.children.find(
      child => child.label === 'textContainer'
    )?.children.find(
      child => child.label === this.activeTextId
    );
    
    if (textContainer) {
      textContainer.scale.set(newScale);
    }
    
    // Update handle positions
    const updatedElement = { ...textElement, scale: newScale };
    this.updateHandlePositions(updatedElement);
  };

  private onPointerUp = (): void => {
    if (!this.isDragging || !this.activeTextId) return;
    
    // Clean up listeners
    this.viewport.off('pointermove', this.onPointerMove, this);
    this.viewport.off('pointerup', this.onPointerUp, this);
    this.viewport.off('pointerupoutside', this.onPointerUp, this);
    
    // Apply final scale to store
    this.store.getState().updateText(this.activeTextId, {
      scale: this.temporaryScale
    });
    
    // Reset state
    this.isDragging = false;
    this.draggedHandle = null;
    
    // Reset handle appearance
    [this.leftHandle, this.rightHandle].forEach(handle => {
      const bg = handle.getChildAt<Graphics>(0);
      bg.clear();
      drawIdleHandleBackground(bg);
    });
  };

  destroy(): void {
    this.hide();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
  }
}
