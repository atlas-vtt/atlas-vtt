import { levelObjects } from '../../levels/levelObjects';
import { featureAt, featureIndex } from '../../mapFeatures/featureIndex';
import { mapFeatureList } from '../../mapFeatures/mapFeatures';
import { openContextMenuGlobal } from '../../react/root/ContextMenuContext';
import type { ViewAtlasStore } from '../../storeFactory';
import type { MapFeature } from '../../types/mapFeatureTypes';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { MapFeatureLabel } from './MapFeatureLabel';
import { mapFeatureMenuEntries } from './mapFeatureMenu';
import { doorText, featureText, type HoverText } from './mapFeatureText';

/** Where the pointer is, as the token renderer's dispatch hands it on. */
export interface FeaturePointer {
  readonly clientX: number;
  readonly clientY: number;
  /** The mouse buttons held: a press under way is a pan, a marquee or a drag, which shows no label. */
  readonly buttons: number;
}

/** What the token renderer asks of the map features while the GM's canvas shows the GM's view. */
export interface MapFeaturePointerHandlers {
  /** The pointer moved with a token tool: labels the door badge `doorId` names, else the feature at `world`. */
  hover(world: Point, doorId: string | null, pointer: FeaturePointer): void;
  /** Nothing on the map is labelled: the pointer left, something above features took it, or the canvas shows the players' view. */
  leave(): void;
  /** The topmost feature at a world point, or null. */
  hitTest(x: number, y: number): string | null;
  openContextMenu(id: string, clientX: number, clientY: number): void;
}

const describeDoor = (wall: WallSegment): HoverText => doorText(wall)!;

/**
 * The GM's hover label of map features and door badges, and a feature's menu. The token renderer
 * calls it only with the select and move tools, while nothing above features is under the pointer,
 * nothing is dragged and the canvas shows the GM's view; anything that ends that hides the label.
 */
export class MapFeatureInteraction implements MapFeaturePointerHandlers {
  private readonly label: MapFeatureLabel;
  private readonly unsubscribe: () => void;

  constructor(private readonly store: ViewAtlasStore, canvas: HTMLCanvasElement) {
    this.label = new MapFeatureLabel(canvas);
    // A label may name only what is still there as it was: features and walls are compared as the view reads them.
    this.unsubscribe = store.subscribe((state, previous) => {
      if (!this.label.naming) return;
      const now = levelObjects(state);
      const before = levelObjects(previous);
      if (state.isGMView !== previous.isGMView || state.isMapLoading !== previous.isMapLoading || state.activeTool !== previous.activeTool
        || now.mapFeatures !== before.mapFeatures || now.walls !== before.walls) this.leave();
    });
  }

  hover(world: Point, doorId: string | null, pointer: FeaturePointer): void {
    const state = this.store.getState();
    if (pointer.buttons > 0 || !state.isGMView || state.isMapLoading) {
      this.leave();
      return;
    }
    if (doorId !== null) {
      const wall = levelObjects(state).walls[doorId];
      if (wall && doorText(wall)) this.label.point(wall, describeDoor, pointer.clientX, pointer.clientY);
      else this.leave();
      return;
    }
    this.label.point(this.featureAt(world), featureText, pointer.clientX, pointer.clientY);
  }

  leave(): void {
    this.label.hide();
  }

  hitTest(x: number, y: number): string | null {
    return this.featureAt({ x, y })?.id ?? null;
  }

  openContextMenu(id: string, clientX: number, clientY: number): void {
    this.leave();
    const feature = mapFeatureList(levelObjects(this.store.getState()).mapFeatures).find((candidate) => candidate.id === id);
    if (feature) openContextMenuGlobal(mapFeatureMenuEntries(this.store, feature), { x: clientX, y: clientY });
  }

  destroy(): void {
    this.unsubscribe();
    this.label.destroy();
  }

  private featureAt(point: Point): MapFeature | null {
    const features = mapFeatureList(levelObjects(this.store.getState()).mapFeatures);
    return features.length === 0 ? null : featureAt(featureIndex(features), point);
  }
}
