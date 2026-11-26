import { describe, expect, it, vi } from 'vitest';
import type { PointerSensorProps } from '@dnd-kit/core';

// The sensor's own listeners need a document; what it is told to wait for is all this test asks.
const made = vi.hoisted(() => ({ options: [] as unknown[] }));
vi.mock('@dnd-kit/core', () => ({
  PointerSensor: class {
    constructor(props: { options: unknown }) {
      made.options.push(props.options);
    }
  },
}));

import { POINTER_ACTIVATION, TOUCH_ACTIVATION, TOUCH_DELAY_MS, TOUCH_TOLERANCE } from '../../../../src/app/statblocks/editor/dnd/dndConfig';
import { PressPointerSensor } from '../../../../src/app/statblocks/editor/dnd/pointerSensor';

function activationFor(pointerType: string): unknown {
  made.options.length = 0;
  const props = { event: { pointerType } as unknown as Event, options: {} } as unknown as PointerSensorProps;
  new PressPointerSensor(props);
  return made.options[0];
}

describe('PressPointerSensor', () => {
  it('lets a mouse and a pen drag after a few pixels, as before', () => {
    expect(activationFor('mouse')).toEqual({ activationConstraint: { distance: 4 } });
    expect(activationFor('pen')).toEqual(POINTER_ACTIVATION);
  });

  it('lets a finger drag only once it has rested on the handle, so a swipe scrolls', () => {
    expect(activationFor('touch')).toEqual(TOUCH_ACTIVATION);
    expect(TOUCH_ACTIVATION.activationConstraint).toEqual({ delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE });
    expect([TOUCH_DELAY_MS, TOUCH_TOLERANCE]).toEqual([250, 5]);
  });
});
