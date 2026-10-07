/**
 * The laser's trail: points with the time they were added, each fading out over
 * `LASER_FADE_TIME`, at most `MAX_TRAIL_SAMPLES` of them. Atlas's laser keeps its trail here.
 * PIXI-free, and part of the shared drawing contract.
 */
import { LASER_FADE_TIME } from '../../tools/laserPointerSettings';
import { MAX_TRAIL_SAMPLES, type BeamPoint } from './laserBeamGeometry';

export interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

export class LaserTrail {
  private points: TrailPoint[] = [];

  get length(): number {
    return this.points.length;
  }

  last(): TrailPoint | undefined {
    return this.points[this.points.length - 1];
  }

  add(x: number, y: number, now: number): void {
    this.points.push({ x, y, timestamp: now });
    if (this.points.length > MAX_TRAIL_SAMPLES) this.points.splice(0, this.points.length - MAX_TRAIL_SAMPLES);
  }

  /** Drops the points that have faded out. */
  prune(now: number): void {
    this.points = this.points.filter((point) => now - point.timestamp < LASER_FADE_TIME);
  }

  /** The trail from oldest to newest, each point with the share of its life left. */
  beamPoints(now: number): BeamPoint[] {
    return this.points.map((point) => ({ x: point.x, y: point.y, life: 1 - (now - point.timestamp) / LASER_FADE_TIME }));
  }

  clear(): void {
    this.points = [];
  }
}
