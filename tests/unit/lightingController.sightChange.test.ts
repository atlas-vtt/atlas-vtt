// @vitest-environment jsdom
// The harness first: it mocks what the controller imports.
import { sceneLightingDeps, setup } from './lightingControllerHarness';
import { describe, expect, it } from 'vitest';

describe('the players\' sight', () => {
  it('is passed on at every change the lighting reports, as a gliding token\'s steps change it', () => {
    let told = 0;
    setup(() => {
      told += 1;
    });
    const before = told;
    sceneLightingDeps.last?.onSightChange?.();
    sceneLightingDeps.last?.onSightChange?.();
    expect(told - before).toBe(2);
  });
});
