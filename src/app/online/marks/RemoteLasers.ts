import type { LaserState } from '../protocol/index.ts';
import { Container, type Renderer } from 'pixi.js';
import { beamWidth, LaserBeam, type LaserBeamView } from '../../pixi/laser/LaserBeam';
import { MAX_TRAIL_SAMPLES, type BeamPoint } from '../../pixi/laser/laserBeamGeometry';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { LASER_FADE_TIME } from '../../tools/laserPointerSettings';
import { PointerTrack, type TrackPoint } from './PointerTrack.ts';

/** Where Atlas draws the laser: above the fog and every mark. */
export const LASER_Z = 2000;

/** One sender's laser as it arrives: its look, pointer, the trail added since the last and the time that trail covers. */
export type RemoteLaser = { readonly who: string } & LaserState;

interface Beam {
  readonly view: LaserBeamView;
  readonly track: PointerTrack;
  /** The sender's laser as it last told it; null once the sender stopped. */
  state: RemoteLaser | null;
  look: { readonly color: string; readonly size: number };
  /** The newest place the track was given; null while the pointer is away. */
  newest: TrackPoint | null;
}

/**
 * The samples a laser's message adds: its trail points, then the pointer where it is not the last of
 * them. A pointer that rests where it was is no new sample, unless its message says that time passed:
 * that time is part of the sender's timeline, and what the pointer does next would be taken for late.
 */
function samplesOf(laser: RemoteLaser, newest: TrackPoint | null): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let index = 0; index + 1 < laser.pts.length; index += 2) points.push({ x: laser.pts[index] ?? 0, y: laser.pts[index + 1] ?? 0, trail: true });
  if (laser.at === null) return points;
  const [x, y] = laser.at;
  const last = points.at(-1) ?? newest;
  const rests = last !== null && last.x === x && last.y === y;
  if (!rests || (points.length === 0 && (laser.span ?? 0) > 0)) points.push({ x, y, trail: laser.on });
  return points;
}

/**
 * Other people's lasers, drawn with Atlas's own beam: one per sender. A message says where the
 * pointer was; the beam is drawn from a `PointerTrack`, a moment behind, so the pointer moves on
 * every frame and its trail grows behind it and fades as it did for its sender. A sender missing
 * from an update stops pointing; its beam goes once what it sent is drawn and its trail has faded.
 */
export class RemoteLasers {
  readonly container = new Container({ label: 'remote-lasers', zIndex: LASER_Z, eventMode: 'none', interactiveChildren: false });
  private readonly beams = new Map<string, Beam>();
  private readonly renderer: Renderer;
  private readonly zoom: () => number;
  /** The senders' nominal send interval, in ms. */
  private readonly interval: number;

  constructor(renderer: Renderer, zoom: () => number, interval: number) {
    this.renderer = renderer;
    this.zoom = zoom;
    this.interval = interval;
  }

  /** Every laser as it is now, with the trail points new since the last update (`now` in ms, the clock `tick` runs on). */
  update(lasers: readonly RemoteLaser[], now: number): void {
    const present = new Set(lasers.map((laser) => laser.who));
    for (const [who, beam] of this.beams) if (!present.has(who)) this.leave(beam, null);
    for (const laser of lasers) {
      const beam = this.beams.get(laser.who) ?? this.addBeam(laser);
      const points = samplesOf(laser, beam.newest);
      beam.track.push(points, laser.span, now);
      beam.newest = points.at(-1) ?? beam.newest;
      beam.state = laser;
      beam.look = laser;
      if (laser.at === null) this.leave(beam, laser);
    }
  }

  /** Whether anything is drawn or fading. */
  get busy(): boolean {
    return this.beams.size > 0;
  }

  /** Draws every beam as it is at `now`; a beam with nothing left to show goes. */
  tick(now: number): void {
    const zoom = this.zoom() || 1;
    for (const [who, beam] of this.beams) {
      const at = beam.track.at(now);
      const moving = beam.track.busy(now);
      const trail: BeamPoint[] = [];
      for (const point of beam.track.played(now)) {
        const life = 1 - (now - point.at) / LASER_FADE_TIME;
        if (point.trail && life > 0) trail.push({ x: point.x, y: point.y, life });
      }
      if (trail.length > MAX_TRAIL_SAMPLES) trail.splice(0, trail.length - MAX_TRAIL_SAMPLES);
      if (beam.state === null && at === null && !moving && trail.length === 0) {
        this.removeBeam(who, beam);
        continue;
      }
      const pointer = at === null ? null : { x: at.x, y: at.y };
      // On its way the pointer draws where its sender drew; at rest, while its sender still does.
      const draws = at !== null && (moving ? at.trail : beam.state?.on === true);
      if (pointer !== null && draws) trail.push({ ...pointer, life: 1 });
      const dot = pointer !== null && !draws ? { ...pointer, life: 1 } : null;
      beam.view.draw({ trail, dot, pointer, color: beam.look.color, width: beamWidth(beam.look.size, zoom), zoom });
    }
  }

  clear(): void {
    for (const [who, beam] of this.beams) this.removeBeam(who, beam);
  }

  destroy(): void {
    this.clear();
    destroyTree(this.container);
  }

  /** The pointer is away: what it sent is still drawn, and it comes back apart from where it left. */
  private leave(beam: Beam, state: RemoteLaser | null): void {
    beam.state = state;
    beam.newest = null;
    beam.track.end();
  }

  private addBeam(laser: RemoteLaser): Beam {
    const view = new LaserBeam();
    this.container.addChild(view.view);
    const beam: Beam = { view, track: new PointerTrack({ interval: this.interval, keep: LASER_FADE_TIME }), state: laser, look: laser, newest: null };
    this.beams.set(laser.who, beam);
    return beam;
  }

  private removeBeam(who: string, beam: Beam): void {
    this.beams.delete(who);
    destroyTree(beam.view.view);
    beam.view.destroy();
  }
}
