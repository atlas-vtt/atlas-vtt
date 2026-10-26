import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { LayerVisibility } from '../../playerSafeFrame';
import { destroyTree } from '../../utils/destroyTree';
import type { TokenGroupContainer } from '../types';
import { TURN_LOOK, flashAppearance, poolRadius, rimRadius, type FlashTiming } from './turnMarkerShape';

/** The textures the markers of a view share. */
export interface TurnMarkerTextures {
  readonly pool: Texture;
  readonly disc: Texture;
}

/** Writes `value` into `target[key]` only when it differs, so a still marker gives PIXI nothing to render. */
function assign<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  if (target[key] !== value) target[key] = value;
}

/**
 * The flash on one token as its turn begins: a pool of gold light on the floor beneath it, a
 * texture scaled with the map like the floor it lies on, and a fine rim, laid out in the map's
 * proportions but drawn in screen pixels inside a container scaled back by the zoom, so it stays
 * crisp at any zoom. Both lie beneath the figure: an inverse alpha mask of the token's shape (its
 * art for unframed art, else the disc its ring encloses) keeps them where the token is transparent,
 * so the art is never tinted, while the layer stays above the lighting. It swells in, holds, fades
 * out (`flashAppearance`) and follows its token meanwhile.
 */
export class TurnMarker {
  readonly view = new Container({ label: 'turnMarker', eventMode: 'none' });
  /** The token's shape, which PIXI never draws: what the spotlight is kept off. */
  private readonly figure = new Sprite({ label: 'turnFigure', anchor: 0.5 });
  /** The spotlight, masked by the figure and scaled as it swells in. */
  private readonly spot = new Container({ label: 'turnSpot' });
  private readonly pool: Sprite;
  private readonly rim = new Container({ label: 'turnRim' });
  private readonly ink = new Graphics();
  private outerRadius = 0;
  private poolDrawn = '';
  private rimDrawn = '';
  private masked = false;
  private started = 0;
  /** How strongly the flash shows now, 0 to 1. */
  private shown = 0;

  constructor(private readonly textures: TurnMarkerTextures, private readonly timing: FlashTiming, now: number) {
    this.pool = new Sprite({ texture: textures.pool, anchor: 0.5, tint: TURN_LOOK.gold });
    this.rim.addChild(this.ink);
    this.spot.addChild(this.pool, this.rim);
    this.view.addChild(this.figure, this.spot);
    this.keepOffArt(true);
    this.restart(now);
  }

  /**
   * Draws the marker for a token whose edge lies `outerRadius` world units from its middle, at
   * `unit` world units per UI unit and `zoom` screen pixels per world unit; nothing when unchanged.
   */
  draw(outerRadius: number, unit: number, zoom: number): void {
    this.outerRadius = outerRadius;
    const poolKey = `${outerRadius}|${unit}`;
    if (poolKey !== this.poolDrawn) {
      this.poolDrawn = poolKey;
      const diameter = 2 * poolRadius(outerRadius, unit);
      this.pool.width = diameter;
      this.pool.height = diameter;
    }
    const rimKey = `${outerRadius}|${zoom}`;
    if (rimKey === this.rimDrawn) return;
    this.rimDrawn = rimKey;
    this.rim.scale.set(1 / zoom);
    const radius = rimRadius(outerRadius, zoom);
    this.ink.clear()
      .circle(0, 0, radius).stroke({ width: TURN_LOOK.keylineWidth, color: 0x000000, alpha: TURN_LOOK.keylineAlpha })
      .circle(0, 0, radius).stroke({ width: TURN_LOOK.rimWidth, color: TURN_LOOK.gold, alpha: TURN_LOOK.rimAlpha });
  }

  /**
   * Whether the renderer keeps the spotlight off the art. PIXI's Canvas renderer has no alpha
   * masks and would draw the pool over the figure, so there the marker is its rim alone.
   */
  keepOffArt(canMask: boolean): void {
    if (canMask === this.masked) return;
    this.masked = canMask;
    this.pool.visible = canMask;
    if (canMask) this.spot.setMask({ mask: this.figure, inverse: true, channel: 'alpha' });
    else this.spot.mask = null;
  }

  /** Flashes again from the start: the turn began anew. */
  restart(now: number): void {
    this.started = now;
    this.advance(now);
  }

  /** Shows the flash as it is at `now`; false once it has faded away. */
  advance(now: number): boolean {
    const look = flashAppearance(now - this.started, this.timing);
    this.shown = look.alpha;
    if (this.spot.scale.x !== look.scale) this.spot.scale.set(look.scale);
    return !look.done;
  }

  /** Stands where `sprite` stands, shown with it, as translucent as it is and as strongly as the flash shows, beneath its shape. */
  follow(sprite: TokenGroupContainer | null): void {
    const visible = sprite !== null && sprite.visible;
    assign(this.view, 'visible', visible);
    if (!sprite) return;
    if (this.view.x !== sprite.x || this.view.y !== sprite.y) this.view.position.copyFrom(sprite.position);
    assign(this.view, 'alpha', sprite.alpha * this.shown);
    if (visible) this.takeShape(sprite);
  }

  /** The flash in the players' frame: as strong as on the canvas, without the GM's translucency of a hidden token. */
  playerLayers(visible: boolean): LayerVisibility[] {
    return [{ layer: this.view, visible, alpha: this.shown }];
  }

  destroy(): void {
    this.spot.mask = null;
    destroyTree(this.view);
  }

  /** The figure takes the token's shape: unframed art as drawn (turned and sized with it), else the disc out to the ring's edge. */
  private takeShape(sprite: TokenGroupContainer): void {
    const art = sprite.getChildByLabel('tokenSprite');
    const unframed = sprite.tokenData?.showRing === false && art instanceof Sprite;
    const texture = unframed ? art.texture : this.textures.disc;
    const scale = unframed ? art.scale : { x: (2 * this.outerRadius) / (texture.width || 1), y: (2 * this.outerRadius) / (texture.height || 1) };
    assign(this.figure, 'texture', texture);
    if (unframed && (this.figure.anchor.x !== art.anchor.x || this.figure.anchor.y !== art.anchor.y)) this.figure.anchor.copyFrom(art.anchor);
    if (!unframed && (this.figure.anchor.x !== 0.5 || this.figure.anchor.y !== 0.5)) this.figure.anchor.set(0.5);
    const x = scale.x * sprite.scale.x;
    const y = scale.y * sprite.scale.y;
    if (this.figure.scale.x !== x || this.figure.scale.y !== y) this.figure.scale.set(x, y);
    assign(this.figure, 'rotation', unframed ? art.rotation : 0);
  }
}
