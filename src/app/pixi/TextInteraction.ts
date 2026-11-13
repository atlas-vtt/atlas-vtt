import { type Container, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { OutlineFilter } from 'pixi-filters';
import type { StoreApi } from 'zustand';
import { t } from '../i18n';
import { levelObjects } from '../levels/levelObjects';
import { openContextMenuGlobal, type ContextMenuEntry } from '../react/root/ContextMenuContext';
import type { ViewAtlasState } from '../storeFactory';
import type { TextElement } from '../types';
import { promptForText } from '../ui/textInputDialog';
import { TextResizeUI } from './TextResizeUI';
import { TextRotationUI } from './TextRotationUI';
import { TEXT_BACKGROUND_LABEL, TEXT_CONTENT_LABEL } from './textElementView';
import { isSecondaryPress } from './utils/pointerButtons';

/** The views the texts of a map are drawn in, as whoever draws them hands them out. */
export interface TextViews {
  /** The view the text `id` is drawn in; null while no picture has shown it. */
  view(id: string): Container | null;
  /** A text's scale changed on its view alone, under a handle that is being dragged. */
  touched(): void;
}

/**
 * Selecting, dragging, turning, scaling and editing the texts on the map, over the views the
 * annotation layer draws them in: a press on a text selects and drags it, a right press opens its
 * menu, the pointer over it outlines it, and the one selected text shows its handles.
 */
export class TextInteraction {
  private readonly rotationUI: TextRotationUI;
  private readonly resizeUI: TextResizeUI;
  private readonly hoverOutline = new OutlineFilter({ thickness: 2, color: 0x00FFFF, quality: 0.5 });
  private readonly unsubscribe: () => void;
  private hoveredTextId: string | null = null;
  private dragState = {
    isDragging: false,
    draggedTextId: null as string | null,
    dragStart: { x: 0, y: 0 },
    textStart: { x: 0, y: 0 },
  };

  constructor(
    private readonly viewport: Viewport,
    private readonly store: StoreApi<ViewAtlasState>,
    private readonly selectionOverlayUpdater: () => void,
    private readonly views: TextViews,
  ) {
    this.rotationUI = new TextRotationUI(viewport, store, (text) => this.resizeUI.refresh(text));
    this.resizeUI = new TextResizeUI(viewport, store, (text) => {
      this.rotationUI.refresh(text);
      // The drag scales the view itself until its release reaches the store.
      this.views.touched();
    });
    this.unsubscribe = this.store.subscribe((state, previous) => {
      if (levelObjects(state).texts !== levelObjects(previous).texts) this.textsChanged(levelObjects(state).texts, levelObjects(previous).texts);
      if (state.selectedIds !== previous.selectedIds) this.updateSelection();
    });
  }

  /** A text's view was made: it takes the pointer from here on. The handlers are bound to the id: the text changes with every edit, its view stays. */
  adopt(textId: string, view: Container): void {
    view.eventMode = 'static';
    view.cursor = 'move';
    view.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e, textId));
    view.on('pointerover', () => this.onPointerOver(textId));
    view.on('pointerout', () => this.onPointerOut(textId));
    // Its parts take the press too, wherever on the text it lands.
    for (const label of [TEXT_BACKGROUND_LABEL, TEXT_CONTENT_LABEL]) {
      const part = view.getChildByLabel(label);
      if (!part) continue;
      part.eventMode = 'static';
      part.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e, textId));
    }
  }

  /** The layers of the selected text's handles: the GM's own, never part of a players' frame or a picture of the scene. */
  get handleLayers(): readonly Container[] {
    return [this.rotationUI.layer, this.resizeUI.layer];
  }

  destroy(): void {
    this.unsubscribe();
    this.viewport.off('pointermove', this.onPointerMove, this);
    this.viewport.off('pointerup', this.onPointerUp, this);
    this.viewport.off('pointerupoutside', this.onPointerUp, this);
    this.rotationUI.destroy();
    this.resizeUI.destroy();
  }

  /** The handles follow the selected text when it is edited, moved by undo or scaled. */
  private textsChanged(texts: Record<string, TextElement>, previous: Record<string, TextElement>): void {
    const id = this.selectedTextId();
    const text = id ? texts[id] : undefined;
    if (!id || !text || text === previous[id]) return;
    this.rotationUI.refresh(text);
    this.resizeUI.refresh(text);
    this.updateUIControlsPosition();
  }

  /** The one selected thing, where it is a text. */
  private selectedTextId(): string | null {
    const { selectedIds } = this.store.getState();
    const id = selectedIds.length === 1 ? selectedIds[0] : undefined;
    return id && levelObjects(this.store.getState()).texts[id] ? id : null;
  }

  private onPointerDown(e: FederatedPointerEvent, textId: string): void {
    e.stopPropagation();

    const textElement = levelObjects(this.store.getState()).texts[textId];
    if (!textElement) return;

    if (isSecondaryPress(e)) {
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
    
    const container = this.views.view(this.dragState.draggedTextId);
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
    const container = this.views.view(textId);
    if (container) {
      container.filters = [this.hoverOutline];
    }
  }

  private onPointerOut(textId: string): void {
    if (this.hoveredTextId === textId) {
      this.hoveredTextId = null;
      const container = this.views.view(textId);
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

  /** The one selected text shows its handles; any other selection shows none. */
  private updateSelection(): void {
    const id = this.selectedTextId();
    const text = id ? levelObjects(this.store.getState()).texts[id] : undefined;
    if (text) {
      this.rotationUI.show(text);
      this.resizeUI.show(text);
      this.updateUIControlsPosition();
    } else {
      this.rotationUI.hide();
      this.resizeUI.hide();
    }
    this.selectionOverlayUpdater();
  }

  /** The handles stand where the selected text's view does, which a drag moves before the store hears of it. */
  private updateUIControlsPosition(): void {
    const id = this.selectedTextId();
    const view = id ? this.views.view(id) : null;
    if (!view) return;
    this.rotationUI.updatePosition(view.position.x, view.position.y);
    this.resizeUI.updatePosition(view.position.x, view.position.y);
  }
}
