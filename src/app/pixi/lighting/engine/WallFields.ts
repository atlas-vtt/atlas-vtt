import type { Renderer } from 'pixi.js';
import { wallRadius } from '../../../lighting/lightingConstants';
import { allSegments, solidSegments, splitBlocking, type Seg } from '../../../lighting/segments';
import type { WallSegment } from '../../../types/wallTypes';
import type { MapBounds } from '../../../vision/visibility';
import { CapsuleField } from './CapsuleField';

/** The fields the composite reads: the walls that stop light, and those that stop sight. */
export interface BoundFields {
  light: CapsuleField;
  sight: CapsuleField;
}

/**
 * The wall fields of one map, each a distance field over the walls that concern its readers:
 *
 * - `tiles`: the two-way solid walls that block light, which every light's tile is traced through
 *   (a one-way wall joins a light's own field where it blocks from the light's side; a limited
 *   wall is in no tile's field: `LimitedTileMask`);
 * - `light()`: every wall that blocks light, one-way and limited ones too, which bounce and
 *   the composite's wall faces treat as solid and as blocking both ways;
 * - `zones()`: the same without the limited walls, which an ambient zone ends at;
 * - `sight()`: every wall that blocks sight, limited ones too, which the explored memory's blur
 *   must not cross.
 *
 * A scene whose walls all block both and both ways has one field, read under all three names;
 * the second exists while there is a one-way or a limited wall and the third while a wall
 * blocks one thing only. `trim` frees those the scene's walls no longer need, once the composite
 * has taken the fields that are left. A wall that blocks one thing is in the fields of that thing alone: to the other it is
 * no wall, in the leak guarantee of each field as anywhere else.
 */
export class WallFields {
  readonly tiles: CapsuleField;
  private lightField: CapsuleField | null = null;
  private sightField: CapsuleField | null = null;
  /** Built when a zone is first drawn in a scene with both limited and one-way walls, and anew after the walls changed. */
  private zoneField: CapsuleField | null = null;
  private zoneSegments: Seg[] | null = null;
  private hasOneWay = false;
  private hasKinds = false;
  private hasLimited = false;
  private zoneStale = true;
  private current: BoundFields;

  constructor(private readonly renderer: Renderer, private readonly bounds: MapBounds, private readonly texel: number) {
    this.tiles = this.create();
    this.current = { light: this.tiles, sight: this.tiles };
  }

  light(): CapsuleField {
    return this.hasOneWay ? this.lightField! : this.tiles;
  }

  sight(): CapsuleField {
    return this.hasKinds ? this.sightField! : this.light();
  }

  /**
   * The walls an ambient zone ends at: those that stop light, but not the limited ones. Light
   * passes a first limited wall and so does a zone's soft edge, and a zone is drawn across a
   * limited wall's line (a wall's capsule is left out of a brighter zone, which made a hedge in
   * a lit clearing a black line). The field of all light walls in a scene without limited
   * walls, the tiles' field in one without one-way walls, else a field of its own.
   */
  zones(): CapsuleField {
    if (!this.zoneSegments) return this.hasLimited ? this.tiles : this.light();
    this.zoneField ??= this.create();
    if (this.zoneStale) this.zoneField.build(this.zoneSegments);
    this.zoneStale = false;
    return this.zoneField;
  }

  /** The fields the composite binds, the same object for as long as they are the same fields. */
  bound(): BoundFields {
    if (this.current.light !== this.light() || this.current.sight !== this.sight()) this.current = { light: this.light(), sight: this.sight() };
    return this.current;
  }

  rebuild(walls: readonly WallSegment[]): void {
    const light = splitBlocking(walls, 'light');
    this.tiles.build(light.twoWay);
    // Limited walls are walls for all but the tiles, like one-way ones.
    this.hasOneWay = light.oneWay.length > 0 || light.limited.length > 0;
    this.hasLimited = light.limited.length > 0;
    this.zoneSegments = this.hasLimited && light.oneWay.length > 0 ? solidSegments(light) : null;
    this.zoneStale = true;
    if (this.hasOneWay) {
      this.lightField ??= this.create();
      this.lightField.build(allSegments(light));
    }
    this.hasKinds = walls.some((wall) => wall.blocks === 'sight' || wall.blocks === 'light');
    if (this.hasKinds) {
      this.sightField ??= this.create();
      this.sightField.build(allSegments(splitBlocking(walls, 'sight')));
    }
  }

  /** How many fields exist now. */
  get held(): number {
    return 1 + [this.lightField, this.sightField, this.zoneField].filter(Boolean).length;
  }

  /**
   * Frees the fields no wall of the scene needs any more. Call it once nothing reads them: the
   * composite has bound what `bound()` gives now, and the zones were drawn through `zones()`.
   */
  trim(): void {
    if (!this.hasOneWay) this.lightField = free(this.lightField);
    if (!this.hasKinds) this.sightField = free(this.sightField);
    if (!this.zoneSegments) this.zoneField = free(this.zoneField);
  }

  destroy(): void {
    this.zoneField?.destroy();
    this.sightField?.destroy();
    this.lightField?.destroy();
    this.tiles.destroy();
  }

  private create(): CapsuleField {
    return new CapsuleField(this.renderer, [0, 0, this.bounds.width, this.bounds.height], this.texel, wallRadius(this.texel));
  }
}

function free(field: CapsuleField | null): null {
  field?.destroy();
  return null;
}
