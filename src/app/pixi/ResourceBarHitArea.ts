import { Graphics } from 'pixi.js';
import type { ResourceSlot } from './token-renderer/resources/ResourceStack';
import type { BarReach } from './token-renderer/resources/stepperLayout';

/**
 * Clickable overlay on a token resource (bar or wheel) that lights up on hover and while its editor is open.
 * Under a finger a bar's overlay takes presses in a band taller than the bar (`fingerBarReach`); it is drawn as ever.
 */
export class ResourceBarHitArea extends Graphics {
  private slot: ResourceSlot | null = null;
  /** The band a press is taken in beyond the resource itself; null for a mouse, and for a wheel. */
  private reach: BarReach | null = null;
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

  /** Places the overlay on the resource drawn in `slot`, in the units of the slot's anchor; `reach` is where a finger's press is taken besides. */
  layout(slot: ResourceSlot, reach: BarReach | null = null): void {
    this.slot = slot;
    this.reach = reach;
    // Without a band the overlay is pressed where it is drawn, as a mouse presses it.
    this.hitArea = reach ? { contains: (x, y) => this.takes(x, y) } : null;
    this.visible = true;
    this.redraw();
  }

  /** Whether a finger's press at a point of the overlay's own space is the resource's: in its band, between its ends. */
  private takes(x: number, y: number): boolean {
    const { slot, reach } = this;
    if (!slot || !reach || x < slot.left || x > slot.left + slot.width) return false;
    return y >= Math.min(reach.top, slot.top) && y <= Math.max(reach.bottom, slot.top + slot.height);
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
