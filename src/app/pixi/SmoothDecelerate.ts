import { Decelerate } from 'pixi-viewport';
import type { IDecelerateOptions, Viewport } from 'pixi-viewport';
import { prefersReducedMotion } from '../utils/motion';

/** Time constant of the brake: a press stops the coast within about three of these. */
const BRAKE_TIME_CONSTANT_MS = 40;
/** Farthest the map may slide after a press (screen px); faster coasts brake harder to stay within it. */
const MAX_BRAKE_TRAVEL_PX = 48;

/**
 * pixi-viewport `decelerate` plugin whose coast after a pan brakes to a stop when the map is
 * pressed, instead of halting dead. Dragging the map again takes over at once.
 */
export class SmoothDecelerate extends Decelerate {
  private braking = false;
  private brakeTimeConstant = BRAKE_TIME_CONSTANT_MS;

  constructor(parent: Viewport, options?: IDecelerateOptions) {
    super(parent, options);
    parent.on('drag-start', this.handleDragStart);
  }

  override down(): boolean {
    if (!this.isActive() || prefersReducedMotion(this.parent.options.events.domElement)) {
      return super.down();
    }
    // The brake slides the current speed times its time constant further.
    const speed = Math.hypot(this.x ?? 0, this.y ?? 0);
    this.brakeTimeConstant = Math.min(BRAKE_TIME_CONSTANT_MS, MAX_BRAKE_TRAVEL_PX / speed);
    this.braking = true;
    this.saved = [];
    return false;
  }

  override up(): boolean {
    // While braking the map moved on its own, not with the pointer: there is no flick to coast from.
    if (this.braking) {
      this.saved = [];
      return false;
    }
    return super.up();
  }

  override update(elapsed: number): void {
    if (!this.braking) {
      super.update(elapsed);
      return;
    }
    if (this.paused) return;

    // Integrates a velocity (px/ms) that decays exponentially, so the stop is frame-rate independent.
    const kept = Math.exp(-elapsed / this.brakeTimeConstant);
    const travel = this.brakeTimeConstant * (1 - kept);
    const vx = this.x ?? 0;
    const vy = this.y ?? 0;
    this.parent.x += vx * travel;
    this.parent.y += vy * travel;
    this.x = vx * kept;
    this.y = vy * kept;
    if (Math.hypot(this.x, this.y) < this.options.minSpeed) this.reset();
    this.parent.emit('moved', { viewport: this.parent, type: 'decelerate' });
  }

  override reset(): void {
    this.braking = false;
    super.reset();
  }

  /**
   * The map was moved by a pan that is not the viewport's own drag (fingers): where it is now is
   * remembered, as `move` does for a drag, so that `glide` knows how fast it went.
   */
  track(): void {
    this.saved.push({ x: this.parent.x, y: this.parent.y, time: performance.now() });
    if (this.saved.length > 60) this.saved.splice(0, 30);
  }

  /** The pan that was tracked has ended: the map coasts on at the speed of its last 100 ms, as after a drag. */
  glide(): void {
    const now = performance.now();
    const from = this.saved.find((snapshot) => snapshot.time >= now - 100);
    this.saved = [];
    if (!from || now === from.time || prefersReducedMotion(this.parent.options.events.domElement)) return;
    const elapsed = now - from.time;
    this.x = (this.parent.x - from.x) / elapsed;
    this.y = (this.parent.y - from.y) / elapsed;
    this.percentChangeX = this.percentChangeY = this.options.friction;
    this.timeSinceRelease = 0;
  }

  /** A pan that is not the viewport's own takes the map over: a coast or a brake under way ends. */
  halt(): void {
    this.reset();
    this.saved = [];
  }

  override destroy(): void {
    this.parent.off('drag-start', this.handleDragStart);
    super.destroy();
  }

  private readonly handleDragStart = (): void => {
    if (!this.braking) return;
    this.reset();
    this.saved = [];
  };
}
