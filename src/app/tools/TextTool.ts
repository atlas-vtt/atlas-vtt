/**
 * Text Tool for Atlas VTT
 * 
 * Handles creation and placement of text elements on the map.
 * Allows users to click on the map to place text and provides
 * editing capabilities.
 */

import { Container, Graphics, Text as PIXIText, TextStyle, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { GridSystem } from '../grid/GridSystem';
import { EventEmitter } from 'events';
import type { TextElement } from '../types';
import { promptForText } from '../ui/textInputDialog';
import { isHandledTap } from '../pixi/utils/handledEvents';
import { MAP_LAYER_Z } from '../pixi/mapLayerOrder';
import { t } from '../i18n';

export class TextTool {
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private gridSystem: GridSystem;
  private eventBus: EventEmitter;
  private isActive: boolean = false;
  
  // Preview container
  private previewContainer: Container | null = null;
  private previewText: PIXIText | null = null;
  private previewBackground: Graphics | null = null;
  
  // Default text properties
  private defaultTextProps = {
    text: t('text.default'),
    fontSize: 24,
    fontFamily: 'Arial',
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundAlpha: 0.7,
    padding: 8,
    borderRadius: 4,
    align: 'center' as const,
    bold: false,
    italic: false
  };
  
  // Click handler reference
  private onMapClick?: (e: FederatedPointerEvent) => void;
  private onMapMove?: (e: FederatedPointerEvent) => void;

  /** Styling chosen in the toolbar, applied to newly placed text. */
  private settingsHandler = (settings: { color?: string; fontSize?: number; bold?: boolean }): void => {
    if (settings.color !== undefined) this.defaultTextProps.color = settings.color;
    if (settings.fontSize !== undefined) this.defaultTextProps.fontSize = settings.fontSize;
    if (settings.bold !== undefined) this.defaultTextProps.bold = settings.bold;

    // Re-create the preview so it reflects the new styling immediately.
    if (this.isActive) {
      this.removePreview();
      this.createPreview();
    }
  };

  constructor(
    viewport: Viewport,
    store: StoreApi<ViewAtlasState>,
    gridSystem: GridSystem,
    eventBus: EventEmitter
  ) {
    this.viewport = viewport;
    this.store = store;
    this.gridSystem = gridSystem;
    this.eventBus = eventBus;
    this.eventBus.on('text-settings-changed', this.settingsHandler);
  }

  activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    
    // Create preview container
    this.createPreview();
    
    // Set up event handlers
    this.onMapClick = this.handleMapClick.bind(this);
    this.onMapMove = this.handleMapMove.bind(this);
    
    this.viewport.on('pointertap', this.onMapClick);
    this.viewport.on('pointermove', this.onMapMove);
    
    // Change cursor
    this.viewport.cursor = 'text';
  }

  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    
    // Remove event handlers
    if (this.onMapClick) {
      this.viewport.off('pointertap', this.onMapClick);
    }
    if (this.onMapMove) {
      this.viewport.off('pointermove', this.onMapMove);
    }
    
    // Remove preview
    this.removePreview();
    
    // Reset cursor
    this.viewport.cursor = 'default';
  }

  private createPreview(): void {
    this.previewContainer = new Container();
    this.previewContainer.label = 'textPreview';
    this.previewContainer.zIndex = MAP_LAYER_Z.text;
    this.previewContainer.eventMode = 'none';
    this.previewContainer.alpha = 0.6;
    
    // Create background
    this.previewBackground = new Graphics();
    this.previewContainer.addChild(this.previewBackground);
    
    // Create text
    const style = new TextStyle({
      fontFamily: this.defaultTextProps.fontFamily,
      fontSize: this.defaultTextProps.fontSize,
      fill: this.defaultTextProps.color,
      align: this.defaultTextProps.align,
      fontWeight: this.defaultTextProps.bold ? 'bold' : 'normal',
      fontStyle: this.defaultTextProps.italic ? 'italic' : 'normal'
    });
    
    this.previewText = new PIXIText({ text: this.defaultTextProps.text, style });
    this.previewText.anchor.set(0.5);
    this.previewContainer.addChild(this.previewText);
    
    // Draw background
    this.updatePreviewBackground();
    
    this.viewport.addChild(this.previewContainer);
  }

  private updatePreviewBackground(): void {
    if (!this.previewBackground || !this.previewText) return;
    
    const padding = this.defaultTextProps.padding;
    const bounds = this.previewText.getLocalBounds();
    
    this.previewBackground.clear();
    this.previewBackground.roundRect(
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2,
      this.defaultTextProps.borderRadius
    );
    this.previewBackground.fill({
      color: parseInt(this.defaultTextProps.backgroundColor.replace('#', ''), 16),
      alpha: this.defaultTextProps.backgroundAlpha,
    });
  }

  private removePreview(): void {
    if (this.previewContainer && this.previewContainer.parent) {
      this.previewContainer.parent.removeChild(this.previewContainer);
    }
    this.previewContainer = null;
    this.previewText = null;
    this.previewBackground = null;
  }

  private handleMapMove(e: FederatedPointerEvent): void {
    if (!this.previewContainer) return;
    
    // Text is annotation, not a grid occupant, so it is placed freely and
    // ignores the map's snap setting.
    const worldPos = this.viewport.toWorld(e.global);
    this.previewContainer.position.set(worldPos.x, worldPos.y);
  }

  private handleMapClick(e: FederatedPointerEvent): void {
    // Only the primary button places text; a right-drag pans the map and ends in a tap too.
    if (e.button !== 0) return;
    // A click a pin, door badge or light marker took places no text.
    if (isHandledTap(e)) return;
    // Free placement — see handleMapMove.
    const worldPos = this.viewport.toWorld(e.global);
    void this.showTextCreationDialog(worldPos.x, worldPos.y);
  }

  private async showTextCreationDialog(x: number, y: number): Promise<void> {
    const text = await promptForText({
      title: t('text.add'),
      confirmLabel: t('creator.create'),
      placeholder: t('text.placeholder'),
    });
    if (!text) return;

    const textData: Omit<TextElement, 'id' | 'kind'> = {
      x,
      y,
      text,
      fontSize: this.defaultTextProps.fontSize,
      fontFamily: this.defaultTextProps.fontFamily,
      color: this.defaultTextProps.color,
      backgroundColor: this.defaultTextProps.backgroundColor,
      padding: this.defaultTextProps.padding,
      borderRadius: this.defaultTextProps.borderRadius,
      opacity: this.defaultTextProps.backgroundAlpha,
      align: this.defaultTextProps.align,
      bold: this.defaultTextProps.bold,
      italic: this.defaultTextProps.italic,
      rotation: 0,
      scale: 1
    };

    const id = this.store.getState().addText(textData);
    this.eventBus.emit('text-created', { id, ...textData });
  }

  destroy(): void {
    this.eventBus.off('text-settings-changed', this.settingsHandler);
    this.deactivate();
  }
}