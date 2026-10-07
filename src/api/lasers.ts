import type { LaserHub } from '../app/pixi/laser/LaserHub';
import { REMOTE_LASER_LIMITS } from '../app/pixi/laser/remoteLasers';
import { isHexColor } from '../app/utils/hexColor';
import type { DisposerSet } from './disposers';
import { acceptsListener } from './listenerCheck';
import type { ViewTracker } from './viewTracker';
import type { LasersApi, LocalLaserEvent, RemoteLaser } from './types/lasers';
import type { Disposer, Point, ViewId } from './types/common';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
  return typeof value === 'object' && value !== null && isFiniteNumber((value as Point).x) && isFiniteNumber((value as Point).y);
}

/** Only the newest points count (`REMOTE_LASER_LIMITS`), so the cost of a call does not grow with what is sent; `dt` keeps matching. */
function newest(points: unknown, dt: unknown): { points: unknown; dt: unknown } {
  const max = REMOTE_LASER_LIMITS.points;
  if (!Array.isArray(points)) return { points, dt };
  const skip = Math.max(0, points.length - max);
  const gaps = Array.isArray(dt) ? (dt.length === points.length ? dt.slice(skip) : dt.slice(-max)) : dt;
  return { points: skip > 0 ? points.slice(skip) : points, dt: gaps };
}

/** A copy Atlas's drawing can trust: the caller keeps no reference into it. Throws, saying what is wrong. */
function checkedLaser(laser: RemoteLaser): RemoteLaser {
  const { from, color, lifted, ...sent } = (laser ?? {}) as { [K in keyof RemoteLaser]?: unknown };
  const { points, dt } = newest(sent.points, sent.dt);
  if (typeof from !== 'string' || from === '') throw new Error('[Atlas API] lasers.show: "from" must name whose laser it is.');
  if (!isHexColor(color)) throw new Error('[Atlas API] lasers.show: "color" must be a #rrggbb colour.');
  if (typeof lifted !== 'boolean') throw new Error('[Atlas API] lasers.show: "lifted" must be true or false.');
  // Each point's x and y and each gap read once, then checked, so a getter cannot change them after the check.
  const taken = Array.isArray(points) ? points.map((point: unknown) => (typeof point === 'object' && point !== null ? { x: (point as Point).x, y: (point as Point).y } : null)) : null;
  if (taken === null || !taken.every(isPoint)) {
    throw new Error('[Atlas API] lasers.show: "points" must be a list of { x, y } numbers.');
  }
  const gaps: unknown[] | undefined = Array.isArray(dt) ? [...(dt as unknown[])] : undefined;
  if (dt !== undefined && !(gaps && gaps.every(isFiniteNumber))) throw new Error('[Atlas API] lasers.show: "dt" must be a list of numbers.');
  return { from, color, lifted, points: taken, ...(gaps ? { dt: gaps as number[] } : {}) };
}

/** An extension's callback must never throw into the GM's pointer handling. */
function callGuarded(listener: (event: LocalLaserEvent) => void, event: LocalLaserEvent): void {
  try {
    listener(Object.freeze({ ...event }));
  } catch (error) {
    console.error('[Atlas API] A laser listener failed:', error);
  }
}

export function lasersApi(tracker: ViewTracker, disposers: DisposerSet): LasersApi {
  const hubOf = (viewId: ViewId): LaserHub | null => tracker.view(viewId)?.renderer?.getLaserHub?.() ?? null;
  return Object.freeze({
    onLocal: (viewId: ViewId, listener: (event: LocalLaserEvent) => void): Disposer => {
      if (!acceptsListener('lasers.onLocal', listener)) return () => undefined;
      const hub = hubOf(viewId);
      if (!hub) return disposers.add(() => undefined);
      let cancelClose: () => void = () => undefined;
      const stop = hub.onLocal((event) => callGuarded(listener, event));
      // The view going away ends the listening too, so a closed view is never retained.
      const dispose = disposers.add(() => { cancelClose(); stop(); });
      cancelClose = tracker.onClose(viewId, dispose);
      return dispose;
    },
    show: (viewId: ViewId, laser: RemoteLaser): void => {
      const checked = checkedLaser(laser);
      hubOf(viewId)?.showRemote(checked);
    },
  });
}
