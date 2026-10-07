import { describe, expect, it, vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';
import { lasersApi } from '../../src/api/lasers';
import type { LocalLaserEvent, RemoteLaser } from '../../src/api/types/lasers';
import { LaserHub } from '../../src/app/pixi/laser/LaserHub';
import { fakeView, trackerWith } from './apiFakes';

const LASER: RemoteLaser = { from: 'ana', color: '#ff0000', points: [{ x: 0, y: 0 }], lifted: false };

function setup(): { hub: LaserHub; lasers: ReturnType<typeof lasersApi>; disposers: DisposerSet; view: ReturnType<typeof fakeView> } {
  const hub = new LaserHub();
  const view = fakeView('v1', { laserHub: hub });
  const disposers = new DisposerSet();
  return { hub, view, disposers, lasers: lasersApi(trackerWith([view]).tracker, disposers) };
}

describe('lasers', () => {
  it('C-laser-1: onLocal hears points and the lift; show reaches the remote layer; unknown views are harmless', () => {
    const { hub, lasers } = setup();
    const events: LocalLaserEvent[] = [];
    const stop = lasers.onLocal('v1', (event) => events.push(event));
    hub.emitLocal({ kind: 'point', x: 1, y: 2 });
    hub.emitLocal({ kind: 'lift' });
    expect(events).toEqual([{ kind: 'point', x: 1, y: 2 }, { kind: 'lift' }]);
    stop();
    hub.emitLocal({ kind: 'lift' });
    expect(events).toHaveLength(2);
    const shown: RemoteLaser[] = [];
    hub.onRemote((laser) => shown.push(laser));
    lasers.show('v1', { from: 'ana', color: '#f00000', points: [{ x: 0, y: 0 }], lifted: false });
    expect(shown).toHaveLength(1);
    expect(() => lasers.show('nope', shown[0]!)).not.toThrow();
    lasers.onLocal('nope', () => undefined)();
  });

  it('a view without a laser hub is harmless too', () => {
    const view = fakeView('v1');
    const lasers = lasersApi(trackerWith([view]).tracker, new DisposerSet());
    expect(() => lasers.show('v1', LASER)).not.toThrow();
    lasers.onLocal('v1', () => undefined)();
  });

  it('gives listeners frozen events and survives a listener that throws', () => {
    const { hub, lasers } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: LocalLaserEvent[] = [];
    lasers.onLocal('v1', () => { throw new Error('boom'); });
    lasers.onLocal('v1', (event) => seen.push(event));
    expect(() => hub.emitLocal({ kind: 'point', x: 1, y: 2 })).not.toThrow();
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('stops listening when the view closes and when the extension is disposed', () => {
    const { hub, view, lasers, disposers } = setup();
    const closed: LocalLaserEvent[] = [];
    lasers.onLocal('v1', (event) => closed.push(event));
    view.close();
    hub.emitLocal({ kind: 'lift' });
    expect(closed).toEqual([]);
    expect(disposers.size).toBe(0);
    const second = setup();
    const heard: LocalLaserEvent[] = [];
    second.lasers.onLocal('v1', (event) => heard.push(event));
    second.disposers.disposeAll();
    second.hub.emitLocal({ kind: 'lift' });
    expect(heard).toEqual([]);
  });

  it('show hands the layer a copy, so later changes by the caller do not reach it', () => {
    const { hub, lasers } = setup();
    const shown: RemoteLaser[] = [];
    hub.onRemote((laser) => shown.push(laser));
    const points = [{ x: 1, y: 1 }];
    lasers.show('v1', { ...LASER, points });
    points[0]!.x = 99;
    expect(shown[0]!.points).toEqual([{ x: 1, y: 1 }]);
  });

  it('show reads each point once, so a getter cannot change it after the check', () => {
    const { hub, lasers } = setup();
    const shown: RemoteLaser[] = [];
    hub.onRemote((laser) => shown.push(laser));
    let reads = 0;
    const point = { y: 0, get x(): number { return reads++ === 0 ? 1 : Number.NaN; } };
    lasers.show('v1', { ...LASER, points: [point] });
    expect(reads).toBe(1);
    expect(shown[0]!.points).toEqual([{ x: 1, y: 0 }]);
  });

  it('show refuses a malformed laser with a clear error', () => {
    const { lasers } = setup();
    expect(() => lasers.show('v1', { ...LASER, from: '' })).toThrow(/from/);
    expect(() => lasers.show('v1', { ...LASER, color: 'red' })).toThrow(/color/);
    expect(() => lasers.show('v1', { ...LASER, points: [{ x: Number.NaN, y: 0 }] })).toThrow(/points/);
    expect(() => lasers.show('v1', { ...LASER, dt: [Number.POSITIVE_INFINITY] })).toThrow(/dt/);
    expect(() => lasers.show('v1', null as unknown as RemoteLaser)).toThrow(/from/);
  });

  it('show counts only the newest points, so a huge call stays cheap', () => {
    const { hub, lasers } = setup();
    const shown: RemoteLaser[] = [];
    hub.onRemote((laser) => shown.push(laser));
    const points = Array.from({ length: 200_000 }, (_, index) => ({ x: index, y: 0 }));
    lasers.show('v1', { ...LASER, points, dt: points.map(() => 1) });
    expect(shown[0]!.points).toHaveLength(64);
    expect(shown[0]!.dt).toHaveLength(64);
    expect(shown[0]!.points.at(-1)).toEqual({ x: 199_999, y: 0 });
  });
});
