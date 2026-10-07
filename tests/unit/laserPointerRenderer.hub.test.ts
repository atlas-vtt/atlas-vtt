import { describe, expect, it, vi } from 'vitest';
import { LaserHub, type LocalLaserEvent } from '../../src/app/pixi/laser/LaserHub';
import { LaserTrail } from '../../src/app/pixi/laser/laserTrail';
import { LaserPointerRenderer } from '../../src/app/pixi/LaserPointerRenderer';

const proto = LaserPointerRenderer.prototype as unknown as Record<string, (...args: unknown[]) => void>;

/** The fields the input handlers read, as `laserPointerRenderer.viewportMoved.test.ts` drives them. */
function harness(): { self: Record<string, unknown>; events: LocalLaserEvent[] } {
  const hub = new LaserHub();
  const events: LocalLaserEvent[] = [];
  hub.onLocal((event) => events.push(event));
  const self = {
    hub, trail: new LaserTrail(), viewport: { scale: { x: 1 } }, readSettings: () => ({ color: '#ff0059', size: 16 }),
    isToolActive: true, isPointing: true, isQuickMode: false, redraw: vi.fn(), liftLaser: proto.liftLaser,
  };
  return { self, events };
}

describe("LaserPointerRenderer and the view's laser hub", () => {
  it("tells the view's hub each point of the GM's laser and when it is let go", () => {
    const { self, events } = harness();
    proto.addTrailPoint!.call(self, 10, 20);
    // Closer than the spacing: not a point of the trail, so not sent either.
    proto.addTrailPoint!.call(self, 11, 20);
    proto.handlePointerUp!.call(self, { button: 0, stopPropagation: () => {} });
    expect(events).toEqual([{ kind: 'point', x: 10, y: 20 }, { kind: 'lift' }]);
  });

  it('lets the laser go when the window loses focus while pointing, and only then', () => {
    const { self, events } = harness();
    self.isPointing = false;
    proto.handleWindowBlur!.call(self);
    expect(events).toEqual([]);
    self.isPointing = true;
    proto.handleWindowBlur!.call(self);
    expect(events).toEqual([{ kind: 'lift' }]);
    expect(self.isPointing).toBe(false);
  });

  it('lets the laser go when the pointer is released outside the canvas', () => {
    const { self, events } = harness();
    proto.handlePointerUpOutside!.call(self);
    expect(events).toEqual([{ kind: 'lift' }]);
  });
});
