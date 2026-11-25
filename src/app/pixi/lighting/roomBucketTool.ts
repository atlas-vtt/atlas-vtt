import type { Container } from 'pixi.js';
import { t } from '../../i18n';
import { levelObjects } from '../../levels/levelObjects';
import type { RoomArea } from '../../lighting/rooms';
import { wallSpaces } from '../../lighting/wallSpaces';
import type { ViewAtlasStore } from '../../storeFactory';
import { roomSizesOf } from '../../stores/roomsSlice';
import type { StrokeShape } from '../../tools/shapeStroke';
import { showNotice } from '../../ui/notice';
import { BucketPouring } from './bucketPouring';
import { DEFAULT_CELL, type BucketMap } from './roomBucket';

export interface RoomBucketToolDeps {
  store: ViewAtlasStore;
  canvas: HTMLCanvasElement;
  /** The rooms overlay the water is drawn in. */
  parent: Container;
  mapImage: () => BucketMap | null;
  /** Whether the rooms mode shows. */
  shown: () => boolean;
  carve: (area: RoomArea, filling: boolean) => void;
  /** Alt was pressed or let go while the rooms mode shows. */
  onAlt: (held: boolean) => void;
}

/**
 * The rooms mode's bucket as `RoomEditor` uses it: a stroke's release pours at the scene's sizes
 * (`BucketPouring`), unless Alt held turned the bucket into its brush alone. Alt is watched on the
 * window too, so the ring turns as the key is pressed, not at the pointer's next move.
 */
export class RoomBucketTool {
  private readonly pouring: BucketPouring;
  private readonly cleanups: Array<() => void> = [];
  /** Alt held: the bucket pours nothing, its brush alone does the opposite (fills where it would carve). */
  altHeld = false;

  constructor(private readonly deps: RoomBucketToolDeps) {
    const { store, canvas, parent, mapImage, shown, carve } = deps;
    this.pouring = new BucketPouring({
      parent, mapImage, canvas, shown, carve,
      floor: () => wallSpaces(levelObjects(store.getState()).walls),
      nothingFound: () => showNotice(t('rooms.bucketFoundNothing')),
    });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Alt' && shown()) deps.onAlt(event.type === 'keydown');
    };
    const win = canvas.ownerDocument.defaultView;
    win?.addEventListener('keydown', onKey, true);
    win?.addEventListener('keyup', onKey, true);
    this.cleanups.push(() => win?.removeEventListener('keydown', onKey, true), () => win?.removeEventListener('keyup', onKey, true));
  }

  /** The bucket pours unless Alt turned it into its brush alone. */
  get pours(): boolean {
    return this.deps.store.getState().roomTool.shape === 'bucket' && !this.altHeld;
  }

  /** Pours along a finished stroke at the scene's sizes, carving or filling what it finds. */
  pour(stroke: Extract<StrokeShape, { type: 'brush' }>, filling: boolean): void {
    const state = this.deps.store.getState();
    const options = { radius: roomSizesOf(state).bucketRadius, cell: state.grid?.size ?? DEFAULT_CELL, sensitivity: state.roomTool.bucketSensitivity };
    void this.pouring.pour(stroke, filling, options);
  }

  /** Carves the pour still spreading at once, and drops one not answered yet. */
  settle(): void {
    this.pouring.settle();
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.pouring.destroy();
  }
}
