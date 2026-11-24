import { describe, expect, it } from 'vitest';
import { clock, formatLength, lengthOfFrames } from '../../../src/app/react/components/dm-screen/sound/musicClock';
import { SOUND_RATE } from '../../../src/app/sound/engine/soundMath';

describe('a track\'s length', () => {
  it('is shown to the nearest second everywhere in Atlas, as the Armarium shows it', () => {
    // 196,740 ms: the library, the share, the review, the mix desk's list and its player all say 3:17.
    const frames = 196.74 * SOUND_RATE;
    expect(formatLength(196.74)).toBe('3:17');
    expect(lengthOfFrames(frames)).toBe('3:17');
    expect(lengthOfFrames(196.4 * SOUND_RATE)).toBe('3:16');
    expect(formatLength(3599.6)).toBe('1:00:00');
    expect(formatLength(-1)).toBe('0:00');
  });

  it('is not how far a track has played, which counts whole seconds gone and never rounds up', () => {
    expect(clock(196.74 * SOUND_RATE)).toBe('3:16');
    expect(clock(0.9 * SOUND_RATE)).toBe('0:00');
  });
});
