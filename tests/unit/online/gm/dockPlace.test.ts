// @vitest-environment jsdom
import '../../../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { inOwnPlace, isPlaced, place, PLACE_CLASS, ROW_CLASS, START_CLASS } from '../../../../src/app/online/gm/dock/dockDom.ts';

function row(withPlace: boolean): HTMLElement {
  const element = document.body.createDiv({ cls: ROW_CLASS });
  if (withPlace) element.createDiv().createDiv({ cls: PLACE_CLASS });
  element.createDiv({ cls: START_CLASS });
  return element;
}

describe('where the control stands', () => {
  it('goes into Atlas\' own place for it, without a spacer, where the row has one', () => {
    const target = row(true);
    const control = document.createElement('div');
    const spacer = target.querySelector(`.${START_CLASS}`)!.createDiv();
    expect(isPlaced(target, control, spacer)).toBe(false);
    expect(place(target, control, spacer)).toBe(true);
    expect(control.parentElement?.classList.contains(PLACE_CLASS)).toBe(true);
    expect(spacer.isConnected).toBe(false);
    expect(inOwnPlace(control)).toBe(true);
    expect(isPlaced(target, control, spacer)).toBe(true);
  });

  it('stands in the row with its spacer first in the start slot where the row has no place for it', () => {
    const target = row(false);
    const control = document.createElement('div');
    const spacer = document.createElement('div');
    expect(place(target, control, spacer)).toBe(true);
    expect(control.parentElement).toBe(target);
    expect(target.querySelector(`.${START_CLASS}`)!.firstElementChild).toBe(spacer);
    expect(inOwnPlace(control)).toBe(false);
  });
});
