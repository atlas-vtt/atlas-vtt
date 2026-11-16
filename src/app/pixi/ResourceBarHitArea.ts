import { Graphics } from 'pixi.js';
import type { ResourceSlot } from './token-renderer/resources/ResourceStack';

/** Clickable overlay on a token resource (bar or wheel) that lights up on hover and while its editor is open. */
export class ResourceBarHitArea extends Graphics {
  private slot: ResourceSlot | null = null;
  private hovered = false;
  private active = false;

  constructor(private readonly accent: number) {
    super();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.visible = false;
    this.on('pointerover', () => this.setHovered(true));
    this.on('pointerout', () => this.setHovered(false));
  }

  /** Places the overlay on the resource drawn in `slot`, in the units of the slot's anchor. */
  layout(slot: ResourceSlot): void {
    this.slot = slot;
    this.visible = true;
    this.redraw();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.redraw();
  }

  hide(): void {
    this.visible = false;
    this.hovered = false;
    this.active = false;
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.redraw();
  }

  private redraw(): void {
    if (this.destroyed || !this.slot) return;
    const { left, top, width, height } = this.slot;
    const radius = height / 2;
    this.clear();
    this.roundRect(left, top, width, height, radius)
      .fill({ color: 0xffffff, alpha: this.hovered && !this.active ? 0.14 : 0 });
    if (!this.hovered && !this.active) return;
    const inset = 1;
    this.roundRect(left - inset, top - inset, width + inset * 2, height + inset * 2, radius + inset)
      .stroke({ width: 1, color: this.active ? this.accent : 0xffffff, alpha: this.active ? 1 : 0.7 });
  }
}
