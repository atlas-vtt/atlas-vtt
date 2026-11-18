import { describe, expect, it } from 'vitest';
import { dialogWindowVariants } from '../../src/app/packages/components/primitives/dialogMotion';
import { fadeOnlyOnExit } from '../../src/app/packages/components/asset-manager/components/windowMotion';

describe('fadeOnlyOnExit', () => {
  it('closes the window in place, fading on the exit’s own timing, and leaves opening as it was', () => {
    const variants = fadeOnlyOnExit(dialogWindowVariants);
    expect(variants.exit).toEqual({ opacity: 0, transition: dialogWindowVariants.exit.transition });
    expect(variants.visible).toBe(dialogWindowVariants.visible);
    expect(variants.hidden).toBe(dialogWindowVariants.hidden);
  });
});
