// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { IMAGE_EXIT, playImageEnter, playImageExit } from '../../src/app/services/imageDisplayMotion';

/** Records every animation an element is given, which stays listed until it is cancelled. */
function animated(): { element: HTMLElement; made: { keyframes: unknown; options: KeyframeAnimationOptions; animation: Animation }[] } {
  const element = document.createElement('div');
  const made: { keyframes: unknown; options: KeyframeAnimationOptions; animation: Animation }[] = [];
  element.animate = ((keyframes: unknown, options: KeyframeAnimationOptions) => {
    const animation = {
      playState: 'running' as AnimationPlayState,
      play: vi.fn(),
      pause: vi.fn(),
      commitStyles: vi.fn(),
      cancel: vi.fn(() => { animation.playState = 'idle'; }),
      finished: Promise.resolve(),
    };
    made.push({ keyframes, options, animation: animation as unknown as Animation });
    return animation as unknown as Animation;
  }) as HTMLElement['animate'];
  element.getAnimations = () => made.map(({ animation }) => animation).filter((animation) => animation.playState !== 'idle');
  return { element, made };
}

describe('the image shown on the player view leaving', () => {
  it('dissolves the image first and lifts the dark just after, both holding where they end', async () => {
    const container = animated();
    const stage = animated();
    await playImageExit(container.element, stage.element);
    expect(stage.made[0]?.options).toMatchObject({ duration: IMAGE_EXIT.image.ms, fill: 'forwards' });
    expect(container.made[0]?.options).toMatchObject({ duration: IMAGE_EXIT.scrim.ms, delay: IMAGE_EXIT.scrim.delayMs, fill: 'forwards' });
  });

  it('takes the entrance over where it stands when closed while the image still decodes, and the entrance never plays after', async () => {
    const container = animated();
    const stage = animated();
    const image = document.createElement('img');
    let decoded: () => void = () => undefined;
    image.decode = () => new Promise<void>((resolve) => { decoded = resolve; });
    const entering = playImageEnter(container.element, stage.element, image, false);
    const entrance = [...stage.made, ...container.made].map(({ animation }) => animation);
    await playImageExit(container.element, stage.element);
    decoded();
    await entering;
    for (const animation of entrance) {
      expect(animation.commitStyles).toHaveBeenCalledOnce();
      expect(animation.play).not.toHaveBeenCalled();
    }
  });
});
