import { Container } from 'pixi.js';
import { MAP_LAYER_Z } from './mapLayerOrder';
import type { PinNameLabel } from './pinNameLabel';
import { destroyTree } from './utils/destroyTree';

/** A pin whose name the layer holds: its group, which the name is placed by, and the name. */
export interface NamedPin {
  readonly group: Container;
  readonly name: PinNameLabel;
}

/**
 * The names of a set of pins in one layer above the fog (`MAP_LAYER_Z.pinNames`), so fog never
 * cuts a name off. Each name stands in a holder that takes its pin group's place and scale, so it
 * is laid out in the group's units as if it were part of the pin; it shows only while its pin does.
 */
export class PinNameLayer {
  readonly view: Container;
  private readonly holders = new Map<string, Container>();

  constructor(label: string) {
    this.view = new Container({ label, eventMode: 'none', interactiveChildren: false });
    this.view.zIndex = MAP_LAYER_Z.pinNames;
  }

  /** Holds exactly these names, each placed like its pin; a name no longer listed goes with its holder. */
  sync(pins: ReadonlyMap<string, NamedPin>): void {
    for (const [id, holder] of this.holders) {
      if (pins.has(id)) continue;
      destroyTree(holder);
      this.holders.delete(id);
    }
    for (const [id, { group, name }] of pins) {
      let holder = this.holders.get(id);
      if (!holder) {
        holder = new Container({ label: `pin-name-${id}`, eventMode: 'none' });
        this.view.addChild(holder);
        this.holders.set(id, holder);
      }
      if (holder.children[0] !== name.view) {
        for (const old of holder.removeChildren()) destroyTree(old);
        holder.addChild(name.view);
      }
      holder.position.copyFrom(group.position);
      holder.scale.copyFrom(group.scale);
      holder.visible = group.visible;
    }
  }

  destroy(): void {
    this.holders.clear();
    destroyTree(this.view);
  }
}
