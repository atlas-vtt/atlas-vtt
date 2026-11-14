import { afterEach, describe, expect, it } from 'vitest';
import { isCtrlClick, isPrimaryPress, isSecondaryPress, setCtrlClickIsSecondary } from '../../src/app/pixi/utils/pointerButtons';

const press = (button: number, ctrlKey = false): { button: number; ctrlKey: boolean } => ({ button, ctrlKey });

describe('which click a press is', () => {
  it('takes the right button for a secondary click and the plain primary button for a primary one everywhere', () => {
    for (const mac of [true, false]) {
      expect(isSecondaryPress(press(2), mac)).toBe(true);
      expect(isPrimaryPress(press(2), mac)).toBe(false);
      expect(isPrimaryPress(press(0), mac)).toBe(true);
      expect(isSecondaryPress(press(0), mac)).toBe(false);
      expect(isCtrlClick(press(0), mac)).toBe(false);
    }
  });

  it('takes a Ctrl+click on macOS for a secondary click that starts no primary gesture', () => {
    expect(isCtrlClick(press(0, true), true)).toBe(true);
    expect(isSecondaryPress(press(0, true), true)).toBe(true);
    expect(isPrimaryPress(press(0, true), true)).toBe(false);
  });

  it('leaves a Ctrl+click a primary click on Windows and Linux', () => {
    expect(isCtrlClick(press(0, true), false)).toBe(false);
    expect(isSecondaryPress(press(0, true), false)).toBe(false);
    expect(isPrimaryPress(press(0, true), false)).toBe(true);
  });

  it('takes the middle button for neither, with or without Ctrl', () => {
    for (const mac of [true, false]) {
      for (const ctrl of [true, false]) {
        expect(isPrimaryPress(press(1, ctrl), mac)).toBe(false);
        expect(isSecondaryPress(press(1, ctrl), mac)).toBe(false);
      }
    }
  });

  it('keeps the right button a secondary click while Ctrl is held on macOS', () => {
    expect(isSecondaryPress(press(2, true), true)).toBe(true);
    expect(isCtrlClick(press(2, true), true)).toBe(false);
  });
});

describe('what the application says about Ctrl+click', () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it('reads a Ctrl+click as a primary click until the application says otherwise', () => {
    expect(isPrimaryPress(press(0, true))).toBe(true);
    expect(isSecondaryPress(press(0, true))).toBe(false);
  });

  it('follows the application and gives the previous answer back', () => {
    restore = setCtrlClickIsSecondary(true);
    expect(isSecondaryPress(press(0, true))).toBe(true);
    expect(isPrimaryPress(press(0, true))).toBe(false);
    restore();
    restore = undefined;
    expect(isPrimaryPress(press(0, true))).toBe(true);
  });
});
