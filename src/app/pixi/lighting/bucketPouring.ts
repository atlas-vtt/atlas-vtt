import { Container, Graphics } from 'pixi.js';
import { strokePolygons } from '../../lighting/exploredEdits';
import { withHolesFilled } from '../../lighting/bucketFill/fillHoles';
import { areaOf, outlinesWithHoles, ringPoints, type RoomArea } from '../../lighting/rooms';
import { STROKE_COLORS, type StrokeShape } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import { MOTION_NORMAL_MS, prefersReducedMotion } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { fillWithHoles } from '../utils/fillWithHoles';
import { ValueTransition } from '../utils/ValueTransition';
import { lightMarkerTheme } from './lightMarker';
import { pourPoints, pouredFloor, type BucketMap, type BucketOptions } from './roomBucket';

/** How long the water takes to reach the farthest wall: slow enough to read as pouring, quick enough not to wait for. */
const POUR_MS = 350;
const WATER_ALPHA = 0.35;

export interface BucketPouringDeps {
  /** The rooms overlay the water is drawn in. */
  parent: Container;
  mapImage: () => BucketMap | null;
  canvas: HTMLCanvasElement;
  /** Whether the rooms mode still shows: a pour that answers after it left is dropped. */
  shown: () => boolean;
  carve: (area: RoomArea, filling: boolean) => void;
  /** The rooms already carved, whose holes with the pour's a carving bucket fills. */
  floor: () => readonly RoomArea[];
  nothingFound: () => void;
}

/** A pour found and being shown: carved once the water has reached its walls. */
interface Poured {
  area: RoomArea;
  drops: Point[];
  filling: boolean;
  map: BucketMap;
  key: string | null;
}

/**
 * A bucket poured on release: the floor it finds (`pouredFloor`) shows as water spreading from the
 * points it was poured at out to its walls, and is carved when the water arrives, one edit and one
 * undo step. A bucket also carves its brush's trail, so nothing it was dragged over stays a hole
 * the flood left, and a carving one fills the holes wholly within its radius of its path. A new pour, or the mode ending, carves the one still spreading at once. Without
 * motion it is carved straight away.
 */
export class BucketPouring {
  private readonly water = new Container({ label: 'bucket-water', eventMode: 'none' });
  private readonly fill = new Graphics();
  private readonly reach = new Graphics();
  private readonly spread: ValueTransition;
  private readonly fade: ValueTransition;
  private poured: Poured | null = null;
  /** Counts pours asked for: an answer for an older one is dropped. */
  private serial = 0;

  constructor(private readonly deps: BucketPouringDeps) {
    // The mask is drawn in the masked object's parent, as PIXI asks.
    this.water.addChild(this.fill, this.reach);
    this.fill.mask = this.reach;
    this.water.visible = false;
    deps.parent.addChild(this.water);
    this.spread = new ValueTransition(0, POUR_MS, (radius) => this.drawReach(radius));
    this.fade = new ValueTransition(1, MOTION_NORMAL_MS, (alpha) => { this.water.alpha = alpha; });
  }

  /** Pours along `trail` (a click or a drag, world): finds the floor, lets the water spread over it, then carves or fills it. */
  async pour(trail: Extract<StrokeShape, { type: 'brush' }>, filling: boolean, options: BucketOptions): Promise<void> {
    const { points } = trail;
    this.settle();
    const map = this.deps.mapImage();
    if (!map) return;
    const key = map.imageKey;
    const serial = this.serial;
    let outline: Point[] | null;
    try {
      outline = await pouredFloor(map, points, options);
    } catch (error) {
      console.error('[Atlas] The bucket could not read the map:', error);
      outline = null;
    }
    if (serial !== this.serial || !this.deps.shown() || !this.sameMap(map, key)) return;
    const drops = pourPoints(points, options.cell);
    const poured = areaOf([...(outline ? [outline] : []), ...strokePolygons(trail)]);
    const area = filling ? poured : withHolesFilled(poured, this.deps.floor(), points, options.radius);
    if (area.length === 0) {
      this.deps.nothingFound();
      return;
    }
    this.poured = { area, drops, filling, map, key };
    if (prefersReducedMotion(this.deps.canvas)) {
      this.finish();
      return;
    }
    this.show(this.poured);
  }

  /** Carves the pour still spreading at once, and drops one not answered yet. */
  settle(): void {
    this.serial++;
    this.finish();
  }

  private show({ area, drops, filling }: Poured): void {
    this.fade.jumpTo(1);
    const color = filling ? STROKE_COLORS.erase : lightMarkerTheme().accent;
    this.fill.clear();
    for (const { outline, holes } of outlinesWithHoles(area)) fillWithHoles(this.fill, ringPoints(outline), holes.map(ringPoints), { color, alpha: WATER_ALPHA });
    // The water has arrived once it covers the corner farthest from every point it was poured at.
    let farthest = 0;
    for (const ring of area) {
      const flat = ringPoints(ring);
      for (let i = 0; i < flat.length; i += 2) farthest = Math.max(farthest, Math.min(...drops.map((drop) => Math.hypot(flat[i]! - drop.x, flat[i + 1]! - drop.y))));
    }
    this.water.visible = true;
    this.spread.jumpTo(0);
    this.spread.animateTo(farthest + 1, () => this.finish());
  }

  private drawReach(radius: number): void {
    this.reach.clear();
    for (const drop of this.poured?.drops ?? []) this.reach.circle(drop.x, drop.y, Math.max(0, radius)).fill({ color: 0xffffff });
  }

  /** Carves the pour shown, where its map is still the one shown, and lets the water fade. */
  private finish(): void {
    const poured = this.poured;
    if (!poured) return;
    this.poured = null;
    this.spread.cancel();
    if (this.sameMap(poured.map, poured.key)) this.deps.carve(poured.area, poured.filling);
    if (!this.water.visible) return;
    this.fade.animateTo(0, () => {
      this.water.visible = false;
      this.fill.clear();
      this.reach.clear();
    });
  }

  private sameMap(map: BucketMap, key: string | null): boolean {
    return this.deps.mapImage() === map && map.imageKey === key;
  }

  destroy(): void {
    this.serial++;
    this.poured = null;
    this.spread.cancel();
    this.fade.cancel();
    this.fill.mask = null;
    destroyTree(this.water);
  }
}
