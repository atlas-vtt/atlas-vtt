// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PLAYER_MIRROR_FPS } from '../../src/app/services/PlayerFrameMirror';
import { MIRRORED, mirroring } from '../mocks/mirrorHarness';

/** Player and DM renders during one second of a DM canvas that changes on every frame of a `hz` display. */
function secondAt(hz: number): { player: number; dm: number } {
  const { events, frame, dm } = mirroring();
  frame(1000);
  for (let i = 1; i <= hz; i++) {
    const time = 1000 + (i * 1000) / hz;
    dm.change();
    dm.tick(time);
    frame(time + 2);
  }
  const count = (event: string): number => events.filter((entry) => entry === event).length;
  return { player: count('render:player'), dm: count('render:dm') };
}

describe('PlayerFrameMirror frame cap', () => {
  it('mirrors every frame of a 60 Hz display', () => {
    expect(secondAt(60)).toEqual({ player: 60, dm: 60 });
  });

  it.each([75, 90, 100, 120, 144, 165, 240])(`holds ${PLAYER_MIRROR_FPS} frames per second on a %i Hz display, never more`, (hz) => {
    const { player, dm } = secondAt(hz);

    expect(dm).toBe(hz);
    expect(player).toBeLessThanOrEqual(PLAYER_MIRROR_FPS);
    expect(player).toBeGreaterThanOrEqual(PLAYER_MIRROR_FPS - 1);
  });

  it('starts counting anew after a pause instead of catching up', () => {
    const { events, dm, frame } = mirroring();
    frame(5000);
    events.length = 0;

    for (const time of [5008, 5016, 5024, 5033]) {
      dm.change();
      dm.tick(time);
    }

    expect(events.filter((event) => event === 'render:player')).toHaveLength(2);
  });

  it('delivers the last frame when the cap skipped it and the DM canvas went idle', () => {
    const { events, frame, dm } = mirroring();
    dm.change();
    dm.tick(100);
    events.length = 0;

    dm.change();
    dm.tick(108);
    expect(events).toEqual(['render:dm']);

    // Too early for another mirrored frame
    frame(110);
    dm.tick(116);
    expect(events).toEqual(['render:dm']);

    frame(118);
    dm.tick(124);
    expect(events).toEqual(['render:dm', ...MIRRORED]);

    frame(140);
    dm.tick(141);
    expect(events).toHaveLength(4);
  });
});
