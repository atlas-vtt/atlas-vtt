import { beforeEach, describe, expect, it, vi } from 'vitest';

const { voices } = vi.hoisted(() => ({ voices: [] as Array<{ stop: ReturnType<typeof vi.fn> }> }));

vi.mock('../../../src/app/dice3d/audio/diceSamples', () => {
  const gain = { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  return {
    masterLevel: () => 1,
    POOLS: { soft: [], glass: [] },
    audio: () => ({ currentTime: 0 }),
    masterGain: () => ({ gain }),
    jitter: () => 1,
    whenReady: () => true,
    voice: () => {
      const tooth = { stop: vi.fn() };
      voices.push(tooth);
      return tooth;
    },
  };
});

import { rollEnd, rollStart } from '../../../src/app/dice3d/audio/diceWheel';

function stopped(teeth: typeof voices): number {
  return teeth.filter((tooth) => tooth.stop.mock.calls.length > 0).length;
}

describe('the dice wheel', () => {
  beforeEach(() => {
    rollEnd();
    voices.length = 0;
  });

  it('stops when its roll ends', () => {
    const roll = rollStart();
    expect(voices.length).toBeGreaterThan(0);
    rollEnd(roll);
    expect(stopped(voices)).toBe(voices.length);
  });

  it('keeps running when an earlier roll ends', () => {
    const first = rollStart();
    const firstTeeth = voices.splice(0);
    const second = rollStart();
    expect(stopped(firstTeeth)).toBe(firstTeeth.length);

    rollEnd(first);
    expect(stopped(voices)).toBe(0);

    rollEnd(second);
    expect(stopped(voices)).toBe(voices.length);
  });
});
