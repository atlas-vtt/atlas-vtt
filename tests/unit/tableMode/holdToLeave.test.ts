// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CHIP_HOLD_MS, HELD_CLASS, holdToLeave } from '../../../src/app/tableMode/holdToLeave';
import { FakeClock } from '../input/fakeGestureClock';

interface Press { button?: number; pointerId?: number; clientX?: number; clientY?: number }

function send(target: EventTarget, type: string, press: Press = {}): void {
  target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { button: 0, pointerId: 1, clientX: 20, clientY: 20, ...press }));
}

function chipScene(): { chip: HTMLElement; clock: FakeClock; held: () => number; stop: () => void } {
  const chip = document.body.createEl('button');
  const clock = new FakeClock();
  let count = 0;
  const stop = holdToLeave(chip, () => { count++; }, clock);
  return { chip, clock, held: () => count, stop };
}

afterEach(() => document.body.empty());

describe('the GM chip of Table mode', () => {
  it('leaves only once it has been held for its time, and shows that it is held meanwhile', () => {
    const { chip, clock, held } = chipScene();
    send(chip, 'pointerdown');
    expect(chip.hasClass(HELD_CLASS)).toBe(true);
    clock.advance(CHIP_HOLD_MS - 1);
    expect(held()).toBe(0);
    clock.advance(1);
    expect(held()).toBe(1);
    expect(chip.hasClass(HELD_CLASS)).toBe(false);
  });

  it('a tap does nothing, however often', () => {
    const { chip, clock, held } = chipScene();
    for (let tap = 0; tap < 5; tap++) {
      send(chip, 'pointerdown');
      clock.advance(120);
      send(document, 'pointerup');
      clock.advance(120);
    }
    clock.advance(CHIP_HOLD_MS * 2);
    expect(held()).toBe(0);
    expect(chip.hasClass(HELD_CLASS)).toBe(false);
  });

  it('a press that slides away, or that the browser takes, does nothing', () => {
    const slid = chipScene();
    send(slid.chip, 'pointerdown');
    slid.clock.advance(300);
    send(document, 'pointermove', { clientX: 60 });
    slid.clock.advance(CHIP_HOLD_MS);
    expect(slid.held()).toBe(0);
    expect(slid.chip.hasClass(HELD_CLASS)).toBe(false);

    const taken = chipScene();
    send(taken.chip, 'pointerdown');
    send(document, 'pointercancel');
    taken.clock.advance(CHIP_HOLD_MS);
    expect(taken.held()).toBe(0);
  });

  it('answers to the primary button alone, and to one pointer at a time', () => {
    const { chip, clock, held } = chipScene();
    send(chip, 'pointerdown', { button: 2 });
    clock.advance(CHIP_HOLD_MS);
    expect(held()).toBe(0);

    send(chip, 'pointerdown');
    clock.advance(CHIP_HOLD_MS / 2);
    // A second finger neither restarts the hold nor ends it by lifting
    send(chip, 'pointerdown', { pointerId: 2 });
    send(document, 'pointerup', { pointerId: 2 });
    clock.advance(CHIP_HOLD_MS / 2);
    expect(held()).toBe(1);
  });

  it('holds nothing once it is taken away', () => {
    const { chip, clock, held, stop } = chipScene();
    send(chip, 'pointerdown');
    stop();
    clock.advance(CHIP_HOLD_MS);
    send(chip, 'pointerdown');
    clock.advance(CHIP_HOLD_MS);
    expect(held()).toBe(0);
  });
});
