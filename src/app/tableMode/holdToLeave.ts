import { LongPress, type PressClock } from '../input/longPress';
import { followPointer, type PointerFollow } from '../utils/pointerDrag';

/** How long the GM chip is held before Table mode ends. */
export const CHIP_HOLD_MS = 600;
/** On the chip while it is held: its ring closes (`table-mode.scss`). */
export const HELD_CLASS = 'is-held';

/**
 * The GM chip's press: `onHeld` runs once a finger, a pen or the primary mouse button has rested
 * on it for `CHIP_HOLD_MS`. A tap, the brush of a hand or a press that slides away does nothing,
 * so nobody at the table ends Table mode by accident. Returns what takes the listeners away.
 */
export function holdToLeave(chip: HTMLElement, onHeld: () => void, clock: PressClock): () => void {
  let follow: PointerFollow | null = null;
  const end = (): void => {
    follow?.stop();
    follow = null;
    press.cancel();
    chip.removeClass(HELD_CLASS);
  };
  const press = new LongPress(clock, () => {
    end();
    onHeld();
  }, CHIP_HOLD_MS);

  const down = (event: PointerEvent): void => {
    if (follow || event.button !== 0) return;
    event.preventDefault();
    press.begin({ x: event.clientX, y: event.clientY });
    chip.addClass(HELD_CLASS);
    follow = followPointer(chip, event, {
      move: (moved) => {
        if (!press.move({ x: moved.clientX, y: moved.clientY })) end();
      },
      end,
    });
  };
  // A finger held on the chip must not open the system's menu over it
  const menu = (event: Event): void => event.preventDefault();

  chip.addEventListener('pointerdown', down);
  chip.addEventListener('contextmenu', menu);
  return () => {
    end();
    chip.removeEventListener('pointerdown', down);
    chip.removeEventListener('contextmenu', menu);
  };
}
