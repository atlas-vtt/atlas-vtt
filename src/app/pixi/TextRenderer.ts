/**
 * Text Renderer for Atlas VTT
 * 
 * Manages rendering of text elements on the map using PIXI.js.
 * Handles text creation, updates, selection, and interaction similar to tokens.
 */

import { Container, Graphics, Text as PIXIText, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { OutlineFilter } from 'pixi-filters';
import { openContextMenuGlobal, type ContextMenuEntry } from '../react/root/ContextMenuContext';
import type { TextElement } from '../types';
import type { GridSystem } from '../grid/GridSystem';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { TextRotationUI } from './TextRotationUI';
import { TextResizeUI } from './TextResizeUI';
import { createTextElementView, TEXT_BACKGROUND_LABEL, TEXT_CONTENT_LABEL, updateTextElementView } from './textElementView';
import { promptForText } from '../ui/textInputDialog';
import { destroyTree } from './utils/destroyTree';
import { t } from '../i18n';

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
  }

  private createText(textElement: TextElement): void {
    const container = createTextElementView(textElement);

    // Set up interaction if not player view
    if (!this.isPlayerView) {
      this.setupInteraction(container, textElement.id);
    }
    
    // Add to container and registry
    this.textContainer.addChild(container);
    this.textElements[textElement.id] = container;
  }

  private updateText(textElement: TextElement): void {
    const container = this.textElements[textElement.id];
    if (container) updateTextElementView(container, textElement);
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
    const background = container.getChildByLabel(TEXT_BACKGROUND_LABEL) as Graphics;
    const text = container.getChildByLabel(TEXT_CONTENT_LABEL) as PIXIText;
    
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
      { name: t('color.white'), value: '#FFFFFF' },
      { name: t('color.black'), value: '#000000' },
      { name: t('color.red'), value: '#FF0000' },
      { name: t('color.green'), value: '#00FF00' },
      { name: t('color.blue'), value: '#0000FF' },
      { name: t('color.yellow'), value: '#FFFF00' },
      { name: t('color.purple'), value: '#FF00FF' },
      { name: t('color.cyan'), value: '#00FFFF' },
      { name: t('color.orange'), value: '#FFA500' },
      { name: t('color.pink'), value: '#FFC0CB' },
    ];

    const bgColors: Array<{ name: string; value: string | undefined }> = [
      { name: t('common.none'), value: undefined },
      { name: t('color.black'), value: '#000000' },
      { name: t('color.white'), value: '#FFFFFF' },
      { name: t('color.darkGray'), value: '#333333' },
      { name: t('color.red'), value: '#FF0000' },
      { name: t('color.green'), value: '#00FF00' },
      { name: t('color.blue'), value: '#0000FF' },
      { name: t('color.yellow'), value: '#FFFF00' },
    ];

    const fontSizes = [12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72];

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: t('text.edit'), icon: 'edit', onClick: () => void this.editText(textElement) },
      {
        type: 'submenu',
        label: t('text.color'),
        icon: 'palette',
        children: textColors.map(c => ({
          type: 'item' as const,
          label: c.name,
          onClick: () => this.store.getState().updateText(textElement.id, { color: c.value }),
        })),
      },
      {
        type: 'submenu',
        label: t('text.background'),
        icon: 'square',
        children: bgColors.map(c => ({
          type: 'item' as const,
          label: c.name,
          onClick: () => this.store.getState().updateText(textElement.id, c.value !== undefined ? { backgroundColor: c.value } : { backgroundColor: '' }),
        })),
      },
      {
        type: 'submenu',
        label: t('text.fontSize'),
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
        label: textElement.bold ? `\u2713 ${t('text.bold')}` : t('text.bold'),
        onClick: () => this.store.getState().updateText(textElement.id, { bold: !textElement.bold }),
      },
      {
        type: 'item',
        label: textElement.italic ? `\u2713 ${t('text.italic')}` : t('text.italic'),
        onClick: () => this.store.getState().updateText(textElement.id, { italic: !textElement.italic }),
      },
      {
        type: 'item',
        label: t('common.delete'),
        icon: 'trash',
        destructive: true,
        onClick: () => this.store.getState().deleteText(textElement.id),
      },
    ];

    openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
  }

  private async editText(textElement: TextElement): Promise<void> {
    const newText = await promptForText({
      title: t('text.editTitle'),
      confirmLabel: t('common.save'),
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