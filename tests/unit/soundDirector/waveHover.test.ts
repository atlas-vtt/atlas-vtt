// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clock } from '@/app/react/components/dm-screen/sound/musicClock';
import { WaveHover } from '@/app/react/components/dm-screen/sound/waveHover';
import { SOUND_RATE } from '@/app/sound/engine/soundMath';

function hoverOn(waveWidth: number, labelWidth: number): { hover: WaveHover; root: HTMLElement; label: HTMLElement } {
  const wave = document.body.createDiv();
  Object.defineProperty(wave, 'clientWidth', { value: waveWidth });
  const root = wave.createDiv();
  const label = root.createSpan();
  Object.defineProperty(label, 'offsetWidth', { value: labelWidth });
  return { hover: new WaveHover(root, label), root, label };
}

describe('the waveform hover', () => {
  it('writes times past an hour with their hours', () => {
    expect(clock(83 * SOUND_RATE)).toBe('1:23');
    expect(clock(59 * 60 * SOUND_RATE)).toBe('59:00');
    expect(clock((3600 + 2 * 60 + 5) * SOUND_RATE)).toBe('1:02:05');
  });

  it('shows the time under the pointer and puts it on the left where the wave ends', () => {
    const { hover, root, label } = hoverOn(400, 40);
    hover.show(0.25, 240 * SOUND_RATE);
    expect(label.textContent).toBe('1:00');
    expect(root.hasAttribute('data-shown')).toBe(true);
    expect(root.hasAttribute('data-flip')).toBe(false);
    expect(root.style.getPropertyValue('--atlas-sound-hover-x')).toBe('100px');
    hover.show(0.95, 240 * SOUND_RATE);
    expect(root.hasAttribute('data-flip')).toBe(true);
    hover.show(null, 240 * SOUND_RATE);
    expect(root.hasAttribute('data-shown')).toBe(false);
  });
});
