import { Container } from 'pixi.js';
import type { VisibleResource } from '../../../resources/resourceTypes';
import type { ResourceSlot } from './ResourceStack';
import { ResourceWheelView } from './ResourceWheelView';
import { WHEEL_SIZE, wheelSlot } from './wheelGeometry';

/** The +/- stepper a selected token's wheel gets on its outer side: distance from the wheel and button diameter. */
export const WHEEL_STEPPER = { gap: 2, size: 10 } as const;

/**
 * A token's wheels beside it: `right` in the units of the anchor `wheelAnchor` gives, `left`
 * in those of its mirror. Each side is a column centred on its anchor, which stands outside
 * everything beside the token. They show only while revealed (`setAlpha`), on hover and
 * selection.
 */
export class ResourceWheels {
  readonly right = new Container({ eventMode: 'none', interactiveChildren: false });
  readonly left = new Container({ eventMode: 'none', interactiveChildren: false });
  private readonly views = new Map<string, ResourceWheelView>();
  private slots: ResourceSlot[] = [];
  private resolution: number | undefined;

  constructor() {
    this.setAlpha(0);
  }

  update(resources: readonly VisibleResource[]): void {
    const keys = new Set(resources.map(({ definition }) => definition.key));
    for (const [key, view] of this.views) {
      if (keys.has(key)) continue;
      view.destroy();
      this.views.delete(key);
    }
    this.slots = resources.map((resource) => {
      const slot = wheelSlot(resource.definition.key, resource.slot);
      const view = this.viewFor(slot.key);
      // Reordering the collection's resources can move one to the other side
      (slot.kind === 'wheel-left' ? this.left : this.right).addChild(view.view);
      view.update(resource, slot.left + WHEEL_SIZE / 2, slot.top + WHEEL_SIZE / 2);
      return slot;
    });
  }

  /** Where each wheel sits, for the click areas and steppers; the same at every scale of the anchors. */
  layout(): readonly ResourceSlot[] {
    return this.slots;
  }

  setAlpha(alpha: number): void {
    for (const side of [this.right, this.left]) {
      side.alpha = alpha;
      side.visible = alpha > 0;
    }
  }

  /** Rasterisation resolution of the numbers, also of wheels created later. */
  setResolution(resolution: number): void {
    this.resolution = resolution;
    for (const view of this.views.values()) view.setResolution(resolution);
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.right.destroy();
    this.left.destroy();
  }

  private viewFor(key: string): ResourceWheelView {
    const existing = this.views.get(key);
    if (existing) return existing;
    const view = new ResourceWheelView();
    if (this.resolution !== undefined) view.setResolution(this.resolution);
    this.views.set(key, view);
    return view;
  }
}
