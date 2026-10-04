/**
 * Text Renderer for Atlas VTT
 * 
 * Manages rendering of text elements on the map using PIXI.js.
 * Handles text creation, updates, selection, and interaction similar to tokens.
 */

import { Container, Graphics, Text as PIXIText, TextStyle, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { OutlineFilter } from 'pixi-filters';
import { openContextMenuGlobal, type ContextMenuEntry } from '../react/root/ContextMenuContext';
import type { TextElement } from '../types';
import type { GridSystem } from '../grid/GridSystem';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { TextRotationUI } from './TextRotationUI';
import { TextResizeUI } from './TextResizeUI';
import { promptForText } from '../ui/textInputDialog';
import { destroyTree } from './utils/destroyTree';
import { applyObjectMask } from './objectMaskDisplay';
import { addonObjectMenuEntries } from '../addons/addonHost';

export class TextRenderer {
  private viewport: Viewport;
  private gridSystem: GridSystem;
  private store: StoreApi<ViewAtlasState>;
  private textContainer: Container;
  private textElements: Record<string, Container> = {};
  private selectionOverlayUpdater: () => void;
  private rotationUI: TextRotationUI;
  private resizeUI: TextResizeUI;
  private isPlayerView: boolean;
  
  // Drag state
  private dragState = {
    isDragging: false,
    draggedTextId: null as string | null,
    dragStart: { x: 0, y: 0 },
    textStart: { x: 0, y: 0 }
  };
  
  // Hover state
  private hoveredTextId: string | null = null;
  private hoverOutline: OutlineFilter;

  // Store unsubscribe function for cleanup
  private unsubscribeFromStore?: () => void;

  constructor(
    viewport: Viewport,
    gridSystem: GridSystem,
    selectionOverlayUpdater: () => void,
    store: StoreApi<ViewAtlasState>,
    isPlayerView: boolean = false
  ) {
    this.viewport = viewport;
    this.gridSystem = gridSystem;
    this.selectionOverlayUpdater = selectionOverlayUpdater;
    this.store = store;
    this.isPlayerView = isPlayerView;
    
    // Create container for all text elements
    this.textContainer = new Container();
    this.textContainer.label = 'textContainer';
    this.textContainer.sortableChildren = true;
    this.textContainer.eventMode = isPlayerView ? 'passive' : 'static';
    this.textContainer.interactiveChildren = !isPlayerView;
    this.viewport.addChild(this.textContainer);
    
    // Create hover outline filter
    this.hoverOutline = new OutlineFilter({ thickness: 2, color: 0x00FFFF, quality: 0.5 });
    
    // Initialize UI components
    this.rotationUI = new TextRotationUI(viewport, store);
    this.resizeUI = new TextResizeUI(viewport, store);
    
    // Subscribe to store changes
    this.subscribeToStore();
    
    // Initial sync
    this.syncTexts(this.store.getState().objects.texts, {});
  }

  private subscribeToStore(): void {
    // Store the unsubscribe function for cleanup
    this.unsubscribeFromStore = this.store.subscribe((state, prevState) => {
      // Check if texts changed
      if (state.objects.texts !== prevState.objects.texts) {
        this.syncTexts(state.objects.texts, prevState.objects.texts);
      }

      // Check if selection changed
      if (state.selectedIds !== prevState.selectedIds) {
        this.updateSelection(state.selectedIds);
      }

      // An add-on changed which texts show
      if (state.objectMask !== prevState.objectMask) {
        this.applyMask();
      }
    });
  }

  private syncTexts(
    newTexts: Record<string, TextElement>,
    prevTexts: Record<string, TextElement>
  ): void {
    // Remove deleted texts
    for (const id in prevTexts) {
      if (!(id in newTexts)) {
        this.removeText(id);
      }
    }
    
    // Add or update texts
    for (const id in newTexts) {
      const text = newTexts[id];
      if (!text) continue;
      
      if (!(id in prevTexts)) {
        // New text
        this.createText(text);
      } else if (text !== prevTexts[id]) {
        // Updated text
        this.updateText(text);
      }
    }
    this.applyMask();
  }

  /** Hides texts an add-on masks and fades ghosted ones. */
  private applyMask(): void {
    const mask = this.store.getState().objectMask;
    for (const [id, container] of Object.entries(this.textElements)) {
      applyObjectMask(container, mask, id);
    }
  }

  /** Display object of every text, by id. */
  getTextContainers(): Readonly<Record<string, Container>> {
    return this.textElements;
  }

  private createText(textElement: TextElement): void {
    const container = new Container();
    container.label = textElement.id;
    container.position.set(textElement.x, textElement.y);
    container.sortableChildren = true;
    
    // Create background
    const background = new Graphics();
    background.label = 'textBackground';
    container.addChild(background);
    
    // Create text style
    const style = new TextStyle({
      fontFamily: textElement.fontFamily,
      fontSize: textElement.fontSize,
      fill: textElement.color,
      align: textElement.align || 'center',
      fontWeight: textElement.bold ? 'bold' : 'normal',
      fontStyle: textElement.italic ? 'italic' : 'normal'
    });
    
    // Create text
    const pixiText = new PIXIText({ text: textElement.text, style });
    pixiText.label = 'textContent';
    pixiText.anchor.set(0.5);
    container.addChild(pixiText);
    
    // Draw background
    this.drawTextBackground(background, pixiText, textElement);
    
    // Apply transformations
    if (textElement.rotation) {
      container.rotation = (textElement.rotation * Math.PI) / 180;
    }
    if (textElement.scale) {
      container.scale.set(textElement.scale);
    }
    
    // Set up interaction if not player view
    if (!this.isPlayerView) {
      this.setupInteraction(container, textElement.id);
    }
    
    // Add to container and registry
    this.textContainer.addChild(container);
    this.textElements[textElement.id] = container;
  }

  private drawTextBackground(
    background: Graphics,
    text: PIXIText,
    textElement: TextElement
  ): void {
    background.clear();
    
    if (textElement.backgroundColor) {
      const padding = textElement.padding || 8;
      const bounds = text.getLocalBounds();
      
      if (textElement.borderRadius) {
        background.roundRect(
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2,
          textElement.borderRadius
        );
      } else {
        background.rect(
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2
        );
      }

      background.fill({
        color: parseInt(textElement.backgroundColor.replace('#', ''), 16),
        alpha: textElement.opacity || 1,
      });
    }
  }

  private updateText(textElement: TextElement): void {
    const container = this.textElements[textElement.id];
    if (!container) return;
    
    // Update position
    container.position.set(textElement.x, textElement.y);
    
    // Update text content and style
    const pixiText = container.getChildByLabel('textContent') as PIXIText;
    if (pixiText) {
      pixiText.text = textElement.text;
      pixiText.style = new TextStyle({
        fontFamily: textElement.fontFamily,
        fontSize: textElement.fontSize,
        fill: textElement.color,
        align: textElement.align || 'center',
        fontWeight: textElement.bold ? 'bold' : 'normal',
        fontStyle: textElement.italic ? 'italic' : 'normal'
      });
    }
    
    // Update background
    const background = container.getChildByLabel('textBackground') as Graphics;
    if (background && pixiText) {
      this.drawTextBackground(background, pixiText, textElement);
    }
    
    // Update transformations
    container.rotation = textElement.rotation ? (textElement.rotation * Math.PI) / 180 : 0;
    container.scale.set(textElement.scale || 1);
  }

  private removeText(id: string): void {
    const container = this.textElements[id];
    if (container) {
      destroyTree(container);
      delete this.textElements[id];
    }
  }

  /** Handlers are bound to the id: the element changes with every edit, the container stays. */
  private setupInteraction(container: Container, textId: string): void {
    container.eventMode = 'static';
    container.cursor = 'move';
    
    // Make both background and text interactive
    const background = container.getChildByLabel('textBackground') as Graphics;
    const text = container.getChildByLabel('textContent') as PIXIText;
    
    if (background) {
      background.eventMode = 'static';
    }
    if (text) {
      text.eventMode = 'static';
    }
    
    // Pointer events
    container.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e, textId));
    container.on('pointerover', () => this.onPointerOver(textId));
    container.on('pointerout', () => this.onPointerOut(textId));
    
    // Also attach to children for better hit detection
    [background, text].forEach(child => {
      if (child) {
        child.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e, textId));
      }
    });
  }

  private onPointerDown(e: FederatedPointerEvent, textId: string): void {
    e.stopPropagation();

    const textElement = this.store.getState().objects.texts[textId];
    if (!textElement) return;

    if (e.button === 2) {
      // Right click - show context menu
      this.showContextMenu(textElement, e);
      return;
    }
    
    // Left click - start drag or select
    const selectedIds = this.store.getState().selectedIds;
    const isSelected = selectedIds.includes(textElement.id);
    
    if (!isSelected) {
      // Select this text
      this.store.getState().setSelection([textElement.id]);
    }
    
    // Start drag
    this.viewport.plugins.pause('drag');
    const worldPos = this.viewport.toWorld(e.global);
    this.dragState = {
      isDragging: true,
      draggedTextId: textElement.id,
      dragStart: { x: worldPos.x, y: worldPos.y },
      textStart: { x: textElement.x, y: textElement.y }
    };
    
    // Set up drag listeners
    this.viewport.on('pointermove', this.onPointerMove, this);
    this.viewport.on('pointerup', this.onPointerUp, this);
    this.viewport.on('pointerupoutside', this.onPointerUp, this);
  }

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.dragState.isDragging || !this.dragState.draggedTextId) return;
    
    const worldPos = this.viewport.toWorld(e.global);
    const dx = worldPos.x - this.dragState.dragStart.x;
    const dy = worldPos.y - this.dragState.dragStart.y;
    
    const container = this.textElements[this.dragState.draggedTextId];
    if (container) {
      container.position.set(
        this.dragState.textStart.x + dx,
        this.dragState.textStart.y + dy
      );
      
      // Update UI controls if selected
      const selectedIds = this.store.getState().selectedIds;
      if (selectedIds.includes(this.dragState.draggedTextId)) {
        this.updateUIControlsPosition();
      }
    }
  };

  private onPointerUp = (e: FederatedPointerEvent): void => {
    if (!this.dragState.isDragging || !this.dragState.draggedTextId) return;
    
    // Clean up listeners
    this.viewport.off('pointermove', this.onPointerMove, this);
    this.viewport.off('pointerup', this.onPointerUp, this);
    this.viewport.off('pointerupoutside', this.onPointerUp, this);
    
    // Calculate final position
    const worldPos = this.viewport.toWorld(e.global);
    const dx = worldPos.x - this.dragState.dragStart.x;
    const dy = worldPos.y - this.dragState.dragStart.y;
    
    // Text is annotation, not a grid occupant, so it moves freely and ignores
    // the map's snap setting.
    const finalX = this.dragState.textStart.x + dx;
    const finalY = this.dragState.textStart.y + dy;

    // Update store
    this.store.getState().moveText(this.dragState.draggedTextId, finalX, finalY);
    
    // Reset drag state
    this.dragState = {
      isDragging: false,
      draggedTextId: null,
      dragStart: { x: 0, y: 0 },
      textStart: { x: 0, y: 0 }
    };
    
    // Resume viewport drag
    this.viewport.plugins.resume('drag');
  };

  private onPointerOver(textId: string): void {
    if (this.hoveredTextId === textId) return;
    
    this.hoveredTextId = textId;
    const container = this.textElements[textId];
    if (container) {
      container.filters = [this.hoverOutline];
    }
  }

  private onPointerOut(textId: string): void {
    if (this.hoveredTextId === textId) {
      this.hoveredTextId = null;
      const container = this.textElements[textId];
      if (container) {
        container.filters = [];
      }
    }
  }

  private showContextMenu(textElement: TextElement, e: FederatedPointerEvent): void {
    const textColors = [
      { name: 'White', value: '#FFFFFF' },
      { name: 'Black', value: '#000000' },
      { name: 'Red', value: '#FF0000' },
      { name: 'Green', value: '#00FF00' },
      { name: 'Blue', value: '#0000FF' },
      { name: 'Yellow', value: '#FFFF00' },
      { name: 'Purple', value: '#FF00FF' },
      { name: 'Cyan', value: '#00FFFF' },
      { name: 'Orange', value: '#FFA500' },
      { name: 'Pink', value: '#FFC0CB' },
    ];

    const bgColors: Array<{ name: string; value: string | undefined }> = [
      { name: 'None', value: undefined },
      { name: 'Black', value: '#000000' },
      { name: 'White', value: '#FFFFFF' },
      { name: 'Dark Gray', value: '#333333' },
      { name: 'Red', value: '#FF0000' },
      { name: 'Green', value: '#00FF00' },
      { name: 'Blue', value: '#0000FF' },
      { name: 'Yellow', value: '#FFFF00' },
    ];

    const fontSizes = [12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: 'Edit Text', icon: 'edit', onClick: () => void this.editText(textElement) },
      {
        type: 'submenu',
        label: 'Text Color',
        icon: 'palette',
        children: textColors.map(c => ({
          type: 'item' as const,
          label: c.name,
          onClick: () => this.store.getState().updateText(textElement.id, { color: c.value }),
        })),
      },
      {
        type: 'submenu',
        label: 'Background Color',
        icon: 'square',
        children: bgColors.map(c => ({
          type: 'item' as const,
          label: c.name,
          onClick: () => this.store.getState().updateText(textElement.id, c.value !== undefined ? { backgroundColor: c.value } : { backgroundColor: '' }),
        })),
      },
      {
        type: 'submenu',
        label: 'Font Size',
        icon: 'text-cursor',
        children: fontSizes.map(s => ({
          type: 'item' as const,
          label: `${s}px`,
          checked: textElement.fontSize === s,
          onClick: () => this.store.getState().updateText(textElement.id, { fontSize: s }),
        })),
      },
      {
        type: 'item',
        label: textElement.bold ? '\u2713 Bold' : 'Bold',
        onClick: () => this.store.getState().updateText(textElement.id, { bold: !textElement.bold }),
      },
      {
        type: 'item',
        label: textElement.italic ? '\u2713 Italic' : 'Italic',
        onClick: () => this.store.getState().updateText(textElement.id, { italic: !textElement.italic }),
      },
      ...addonObjectMenuEntries(this.store, 'text', textElement.id),
      {
        type: 'item',
        label: 'Delete',
        icon: 'trash',
        destructive: true,
        onClick: () => this.store.getState().deleteText(textElement.id),
      },
    ];

    openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
  }

  private async editText(textElement: TextElement): Promise<void> {
    const newText = await promptForText({
      title: 'Edit text',
      confirmLabel: 'Save',
      initialValue: textElement.text,
    });
    if (newText && newText !== textElement.text) {
      this.store.getState().updateText(textElement.id, { text: newText });
    }
  }

  private updateSelection(selectedIds: string[]): void {
    // Clear all selection indicators
    Object.values(this.textElements).forEach(container => {
      container.filters = container === this.textElements[this.hoveredTextId!] 
        ? [this.hoverOutline] 
        : [];
    });
    
    // Update UI controls
    if (selectedIds.length === 1 && selectedIds[0]!.startsWith('text_')) {
      const textId = selectedIds[0]!;
      const textElement = this.store.getState().objects.texts[textId];
      const container = this.textElements[textId];
      
      if (textElement && container) {
        // Show rotation and resize UI
        this.rotationUI.show(textElement);
        this.resizeUI.show(textElement);
        this.updateUIControlsPosition();
      }
    } else {
      // Hide UI controls
      this.rotationUI.hide();
      this.resizeUI.hide();
    }
    
    // Trigger selection overlay update
    this.selectionOverlayUpdater();
  }

  private updateUIControlsPosition(): void {
    const selectedIds = this.store.getState().selectedIds;
    if (selectedIds.length === 1 && selectedIds[0]!.startsWith('text_')) {
      const textId = selectedIds[0]!;
      const container = this.textElements[textId];
      
      if (container) {
        // Update UI controls to match text position
        this.rotationUI.updatePosition(container.position.x, container.position.y);
        this.resizeUI.updatePosition(container.position.x, container.position.y);
      }
    }
  }

  getContainer(): Container {
    return this.textContainer;
  }

  destroy(): void {
    // Unsubscribe from store to prevent memory leaks
    this.unsubscribeFromStore?.();

    // Clean up
    this.rotationUI.destroy();
    this.resizeUI.destroy();

    // Remove all text elements
    Object.keys(this.textElements).forEach(id => this.removeText(id));

    destroyTree(this.textContainer);
  }
}