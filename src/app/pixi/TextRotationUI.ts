/**
 * Text Rotation UI
 *
 * A single rotation handle above the selected text, in the manner of Figma and
 * other design tools. The handle rides the text's own rotation, so it always
 * sits "above" the text from the text's point of view.
 */

import { Container, Graphics, Sprite, Texture, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { TextElement } from '../types';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import { MAP_LAYER_Z } from './mapLayerOrder';
import { levelObjects } from '../levels/levelObjects';

/** Gap between the top of the text and the handle. */
const HANDLE_OFFSET = 28;
const HANDLE_RADIUS = 13;
const SNAP_DEGREES = 15;

export class TextRotationUI {
  private viewport: Viewport;
  private store: StoreApi<ViewAtlasState>;
  private container: Container;
  private handle: Container;
  private handleBackground: Graphics;
  private stem: Graphics;
  private activeTextId: string | null = null;
  private isDragging: boolean = false;
  private isHovered: boolean = false;
  private temporaryRotation: number = 0;

  // Drag state
  private dragStartAngle: number = 0;
  private textStartRotation: number = 0;

  constructor(viewport: Viewport, store: StoreApi<ViewAtlasState>) {
    this.viewport = viewport;
    this.store = store;

    this.container = new Container();
    this.container.label = 'textRotationUI';
    this.container.zIndex = MAP_LAYER_Z.textHandles;
    this.container.visible = false;
    this.viewport.addChild(this.container);

    this.stem = new Graphics();
    this.container.addChild(this.stem);

    this.handle = new Container();
    this.handle.label = 'textRotationHandle';
    this.handleBackground = new Graphics();
    this.handle.addChild(this.handleBackground);

    const icon = new Sprite(this.createRotateIcon());
    icon.anchor.set(0.5);
    icon.scale.set(0.6);
    this.handle.addChild(icon);

    this.handle.eventMode = 'static';
    this.handle.cursor = 'grab';
    this.handle.on('pointerdown', this.onHandlePointerDown.bind(this));
    this.handle.on('pointerover', () => {
      this.isHovered = true;
      this.drawHandle();
    });
    this.handle.on('pointerout', () => {
      this.isHovered = false;
      this.drawHandle();
    });

    this.container.addChild(this.handle);
    this.drawHandle();
  }

  private drawHandle(): void {
    const active = this.isHovered || this.isDragging;

    this.handleBackground.clear();
    this.handleBackground.circle(0, 0, HANDLE_RADIUS);
    this.handleBackground.fill({ color: active ? 0x4c8dff : 0x1e1e1e, alpha: 0.92 });
    this.handleBackground.circle(0, 0, HANDLE_RADIUS);
    this.handleBackground.stroke({ width: 1.5, color: 0xffffff, alpha: active ? 0.9 : 0.55 });
  }

  /** A circular arrow, drawn once to a canvas and reused as a texture. */
  private createRotateIcon(): Texture {
    const size = 32;
    const canvas = createEl('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Texture.WHITE;

    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const radius = size / 3.2;

    // Open circle, leaving a gap for the arrowhead.
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI * 0.65, Math.PI * 1.15);
    ctx.stroke();

    // Arrowhead at the open end, pointing along the direction of travel.
    const tipAngle = -Math.PI * 0.65;
    const tipX = Math.cos(tipAngle) * radius;
    const tipY = Math.sin(tipAngle) * radius;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - 5, tipY - 1);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + 1, tipY + 5);
    ctx.stroke();

    return Texture.from(canvas);
  }

  show(textElement: TextElement): void {
    this.activeTextId = textElement.id;
    this.container.visible = true;
    this.temporaryRotation = textElement.rotation || 0;
    this.updateHandlePositions(textElement);
  }

  hide(): void {
    this.container.visible = false;
    this.activeTextId = null;
    this.isDragging = false;
    this.isHovered = false;
    this.drawHandle();
  }

  updatePosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  private updateHandlePositions(textElement: TextElement): void {
    const textContainer = this.viewport.children
      .find((child) => child.label === 'textContainer')
      ?.children.find((child) => child.label === textElement.id);

    if (!textContainer) return;

    const bounds = textContainer.getLocalBounds();
    const centerX = (bounds.left + bounds.right) / 2;
    const handleY = bounds.top - HANDLE_OFFSET;

    this.handle.position.set(centerX, handleY);

    // Short connector so the handle reads as attached to the text.
    this.stem.clear();
    this.stem.moveTo(centerX, bounds.top);
    this.stem.lineTo(centerX, handleY + HANDLE_RADIUS);
    this.stem.stroke({ width: 1.5, color: 0xffffff, alpha: 0.45 });

    this.container.rotation = (this.temporaryRotation * Math.PI) / 180;
  }

  private onHandlePointerDown(e: FederatedPointerEvent): void {
    if (!this.activeTextId) return;

    e.stopPropagation();
    this.isDragging = true;
    this.drawHandle();

    const textElement = levelObjects(this.store.getState()).texts[this.activeTextId];
    if (!textElement) return;

    const worldPos = this.viewport.toWorld(e.global);
    this.dragStartAngle = Math.atan2(worldPos.y - textElement.y, worldPos.x - textElement.x);
    this.textStartRotation = textElement.rotation || 0;

    this.viewport.cursor = 'grabbing';
    this.viewport.on('pointermove', this.onPointerMove, this);
    this.viewport.on('pointerup', this.onPointerUp, this);
    this.viewport.on('pointerupoutside', this.onPointerUp, this);
  }

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.isDragging || !this.activeTextId) return;

    const textElement = levelObjects(this.store.getState()).texts[this.activeTextId];
    if (!textElement) return;

    const worldPos = this.viewport.toWorld(e.global);
    const currentAngle = Math.atan2(worldPos.y - textElement.y, worldPos.x - textElement.x);
    const deltaAngle = ((currentAngle - this.dragStartAngle) * 180) / Math.PI;

    let newRotation = this.textStartRotation + deltaAngle;
    if (e.shiftKey) {
      newRotation = Math.round(newRotation / SNAP_DEGREES) * SNAP_DEGREES;
    }
    newRotation = ((newRotation % 360) + 360) % 360;

    this.temporaryRotation = newRotation;
    this.container.rotation = (newRotation * Math.PI) / 180;

    const textContainer = this.viewport.children
      .find((child) => child.label === 'textContainer')
      ?.children.find((child) => child.label === this.activeTextId);

    if (textContainer) {
      textContainer.rotation = (newRotation * Math.PI) / 180;
    }
  };

  private onPointerUp = (): void => {
    if (!this.isDragging || !this.activeTextId) return;

    this.viewport.off('pointermove', this.onPointerMove, this);
    this.viewport.off('pointerup', this.onPointerUp, this);
    this.viewport.off('pointerupoutside', this.onPointerUp, this);

    this.store.getState().updateText(this.activeTextId, {
      rotation: this.temporaryRotation,
    });

    this.isDragging = false;
    this.viewport.cursor = 'default';
    this.drawHandle();
  };

  destroy(): void {
    this.hide();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
  }
}
