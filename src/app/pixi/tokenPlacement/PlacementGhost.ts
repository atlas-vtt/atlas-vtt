import { CanvasSource, Container, Sprite, Texture, type Graphics } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { Spring, type SpringFeel } from './placementSpring';
import type { Point } from './placementLayout';
import { facingMark } from './facingMark';

/** A token as it will look once placed, holding its art until released. */
export interface TokenPreview {
  readonly group: Container;
  /** Diameter of the token in world pixels. */
  readonly diameter: number;
  /** Turns the token's art to face `degrees` (0 up, clockwise), as a placed token's `rotation` does. */
  rotate(degrees: number): void;
  release(): void;
}

/** Where a ghost is wanted: its place, its size against the placed token, its opacity and how high it is held. */
export interface GhostPose {
  at: Point;
  scale: number;
  alpha: number;
  /** 1 held above the map with its shadow under it, 0 lying on it. */
  lift: number;
}

/** Follows the pointer from cell to cell: quick, without overshoot. */
const FOLLOW: SpringFeel = { frequency: 42, damping: 1 };
/** Moves to a new part (formation to queue and back, up the queue): slower, with a little overshoot. */
const REARRANGE: SpringFeel = { frequency: 15, damping: 0.78 };
/** How long a rearrangement takes to hand over to following again. */
const REARRANGE_S = 0.45;
const SCALE: SpringFeel = { frequency: 26, damping: 0.62 };
const FADE: SpringFeel = { frequency: 22, damping: 1 };
/** Turns towards the way it is pointed, a little behind the pointer, without spinning past it. */
const TURN: SpringFeel = { frequency: 30, damping: 0.85 };
/** Put down: the token presses into the map and springs back to its size. */
const LANDING: SpringFeel = { frequency: 34, damping: 0.4 };
/** How long a landed ghost stays over the placed token before it fades into it. */
const LANDED_HOLD_S = 0.16;

/** The size a held token is drawn at: lifted towards the viewer. */
export const HELD_SCALE = 1.06;

type GhostState = 'held' | 'landing' | 'vanishing';

/**
 * A token in the GM's hand, drawn over the map where it would be placed. It moves by springs, so
 * it glides between cells and between the formation and the queue, lands with a press into the
 * map when placed and fades into the token placed under it.
 */
export class PlacementGhost {
  readonly root = new Container();
  /** The token and its shadow, which fade together; the facing mark beside them stays solid. */
  private readonly body = new Container();
  private readonly shadow: Sprite;
  private readonly x: Spring;
  private readonly y: Spring;
  private readonly scale: Spring;
  private readonly alpha: Spring;
  private readonly lift: Spring;
  /** Which way the token faces, in degrees, unwrapped so it always turns the short way. */
  private readonly facing: Spring;
  private readonly mark: Graphics;
  private readonly markShown = new Spring(0, FADE);
  private rearranging = 0;
  private state: GhostState = 'held';
  private landedFor = 0;
  /** The part the ghost plays now, so a change of part is seen as a rearrangement. */
  private part: string | null = null;

  constructor(private readonly preview: TokenPreview, start: Point, facing: number, accent: number, private readonly reducedMotion: boolean) {
    this.shadow = new Sprite(shadowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.eventMode = 'none';
    this.root.eventMode = 'none';
    this.mark = facingMark(preview.diameter / 2, accent);
    this.body.addChild(this.shadow, preview.group);
    this.root.addChild(this.body, this.mark);
    preview.group.position.set(0, 0);
    this.x = new Spring(start.x, FOLLOW);
    this.y = new Spring(start.y, FOLLOW);
    this.scale = new Spring(0.6, SCALE);
    this.alpha = new Spring(0, FADE);
    this.lift = new Spring(1, FADE);
    this.facing = new Spring(facing, TURN);
    this.apply();
  }

  get diameter(): number {
    return this.preview.diameter;
  }

  /** Where the ghost is drawn now. */
  get position(): Point {
    return { x: this.x.value, y: this.y.value };
  }

  get finished(): boolean {
    return this.state !== 'held' && this.alpha.value <= 0.005 && this.alpha.target === 0;
  }

  /** Wants the ghost at `pose` playing `part`; a new part moves it there slower, along a short arc of overshoot. */
  pose(pose: GhostPose, part: string): void {
    if (this.state !== 'held') return;
    if (this.part !== null && this.part !== part) this.rearranging = REARRANGE_S;
    this.part = part;
    // Tokens waiting in the queue pass under the one being placed
    this.root.zIndex = part.startsWith('queue') ? 0 : 1;
    this.x.target = pose.at.x;
    this.y.target = pose.at.y;
    this.scale.target = pose.scale;
    this.alpha.target = pose.alpha;
    this.lift.target = pose.lift;
  }

  /**
   * Turns the token to face `degrees` the short way round. `showing` puts the mark of the way it will
   * face there at once and solid, while the art turns after it; otherwise the mark fades.
   */
  turnTo(degrees: number, showing: boolean): void {
    const step = ((((degrees - this.facing.target) % 360) + 540) % 360) - 180;
    this.facing.target += step;
    if (showing) this.markShown.jump(1);
    else this.markShown.target = 0;
  }

  /** Puts the ghost down at its place: it presses into the map, then fades into the token placed there. */
  land(at: Point): void {
    this.state = 'landing';
    this.x.target = at.x;
    this.y.target = at.y;
    this.x.feel = FOLLOW;
    this.y.feel = FOLLOW;
    this.scale.feel = LANDING;
    this.scale.target = 1;
    this.scale.kick(-1.6);
    this.lift.target = 0;
    this.alpha.target = 1;
    this.markShown.target = 0;
  }

  /** Takes the ghost away without placing it: it shrinks and fades where it is. */
  vanish(): void {
    this.state = 'vanishing';
    this.scale.target = this.scale.value * 0.75;
    this.alpha.target = 0;
    this.lift.target = 0;
    this.markShown.target = 0;
  }

  /** Moves the ghost `seconds` on; whether it still moves. */
  step(seconds: number): boolean {
    if (this.reducedMotion) {
      this.x.jump(this.x.target);
      this.y.jump(this.y.target);
      this.scale.jump(this.scale.target);
      this.lift.jump(this.lift.target);
      this.facing.jump(this.facing.target);
    }
    this.followFeel(seconds);
    if (this.state === 'landing') {
      this.landedFor += seconds;
      if (this.landedFor >= (this.reducedMotion ? 0 : LANDED_HOLD_S)) this.alpha.target = 0;
    }
    for (const spring of [this.x, this.y]) spring.step(seconds);
    for (const spring of [this.scale, this.alpha, this.lift, this.markShown]) spring.step(seconds, 0.01);
    this.facing.step(seconds, 0.1);
    this.apply();
    return !this.finished && !this.atRest();
  }

  destroy(): void {
    this.body.removeChild(this.preview.group);
    this.preview.release();
    destroyTree(this.root);
  }

  private atRest(): boolean {
    return this.state === 'held' && this.rearranging <= 0 && [this.x, this.y, this.scale, this.alpha, this.lift, this.facing, this.markShown].every((spring) => spring.atRest);
  }

  /** A rearrangement hands over to following by raising the springs' frequency again as it ends. */
  private followFeel(seconds: number): void {
    if (this.state !== 'held') return;
    this.rearranging = Math.max(0, this.rearranging - seconds);
    const share = this.rearranging / REARRANGE_S;
    const feel: SpringFeel = {
      frequency: FOLLOW.frequency + (REARRANGE.frequency - FOLLOW.frequency) * share,
      damping: FOLLOW.damping + (REARRANGE.damping - FOLLOW.damping) * share,
    };
    this.x.feel = feel;
    this.y.feel = feel;
  }

  private apply(): void {
    const lift = Math.max(0, this.lift.value);
    const scale = Math.max(0.01, this.scale.value);
    this.root.position.set(this.x.value, this.y.value);
    this.preview.group.scale.set(scale);
    this.body.alpha = Math.min(1, Math.max(0, this.alpha.value));
    this.preview.rotate(((this.facing.value % 360) + 360) % 360);
    // The mark shows where the token will face, never the art's way there
    this.mark.rotation = (this.facing.target * Math.PI) / 180;
    this.mark.scale.set(scale);
    this.mark.alpha = Math.min(1, Math.max(0, this.markShown.value));
    this.mark.visible = this.mark.alpha > 0.005;
    const radius = (this.preview.diameter / 2) * scale;
    this.shadow.position.set(radius * 0.1 * lift, radius * 0.22 * lift);
    this.shadow.width = radius * 2 * (1.08 + 0.1 * lift);
    this.shadow.height = this.shadow.width;
    this.shadow.alpha = 0.5 * lift;
  }
}

let cachedShadow: Texture | null = null;

/** A soft round shadow, drawn once. */
function shadowTexture(): Texture {
  if (cachedShadow) return cachedShadow;
  const size = 128;
  const canvas = createEl('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.5)');
    gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.16)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  cachedShadow = new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'linear' }) });
  return cachedShadow;
}
