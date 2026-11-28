// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { TOUCH_ATTRIBUTE, watchInput } from '../../../src/app/packages/components/primitives/lastInput';

/** A pointer event as a device of `kind` sends it; jsdom's own events carry no pointer type. */
function use(type: 'pointerdown' | 'pointermove', kind: 'mouse' | 'pen' | 'touch'): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: kind });
  document.body.dispatchEvent(event);
}

const marked = (): boolean => document.documentElement.hasAttribute(TOUCH_ATTRIBUTE);

let stop: () => void = () => undefined;
afterEach(() => {
  use('pointermove', 'mouse');
  stop();
});

describe('the mark a finger leaves on the page, under which hover styles hold back', () => {
  it('stands while a finger was the last pointer, and goes once a mouse moves or a pen presses', () => {
    stop = watchInput(document);
    expect(marked()).toBe(false);
    use('pointerdown', 'touch');
    expect(marked()).toBe(true);
    // A key typed meanwhile leaves it: what was tapped last still holds `:hover`
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    expect(marked()).toBe(true);
    use('pointermove', 'mouse');
    expect(marked()).toBe(false);
    use('pointerdown', 'touch');
    use('pointerdown', 'pen');
    expect(marked()).toBe(false);
  });

  it('is taken away when the page is no longer watched', () => {
    stop = watchInput(document);
    use('pointerdown', 'touch');
    stop();
    expect(marked()).toBe(false);
    stop = () => undefined;
  });
});
