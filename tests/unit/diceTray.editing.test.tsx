// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderDiceTray } from '../helpers/renderDiceTray';

vi.mock('../../src/app/packages/components/primitives/tooltip', () => ({
  LabelTooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
afterEach(cleanup);

const formula = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Formula' }) as HTMLInputElement;
const modifier = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Modifier' }) as HTMLInputElement;
const die = (name: RegExp | string): HTMLElement => screen.getByRole('button', { name });

describe('dice tray editing', () => {
  it('writes clicks into the formula, takes a die back on right-click and Alt-click', () => {
    renderDiceTray();
    fireEvent.click(die('d6'));
    fireEvent.click(die('d6, 1 in the tray'));
    fireEvent.click(die('d20'));
    expect(formula().value).toBe('2d6 + 1d20');
    fireEvent.contextMenu(die('d6, 2 in the tray'));
    fireEvent.click(die('d20, 1 in the tray'), { altKey: true });
    expect(formula().value).toBe('1d6');
  });

  it('takes a typed formula and rolls it with Enter', () => {
    const { onRoll } = renderDiceTray();
    fireEvent.change(formula(), { target: { value: '4d6kh3' } });
    fireEvent.click(die('d6, 4 in the tray'));
    expect(formula().value).toBe('5d6kh3');
    fireEvent.keyDown(formula(), { key: 'Enter' });
    expect(onRoll).toHaveBeenCalledWith({ formula: '5d6kh3', advantage: null });
  });

  it('takes a typed modifier, and steps it', () => {
    renderDiceTray();
    fireEvent.click(die('d20'));
    fireEvent.focus(modifier());
    fireEvent.change(modifier(), { target: { value: '-3' } });
    fireEvent.keyDown(modifier(), { key: 'Enter' });
    expect(formula().value).toBe('1d20 − 3');
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }));
    expect(formula().value).toBe('1d20 − 2');
    expect(modifier().value).toBe('−2');
  });

  it('rolls a die at once on Shift-click, with the modifier, and leaves the tray as it was', () => {
    const { onRoll, onClose } = renderDiceTray();
    fireEvent.click(die('d6'));
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }));
    fireEvent.click(die('d20'), { shiftKey: true });
    expect(onRoll).toHaveBeenCalledWith({ formula: '1d20 + 1', advantage: null });
    expect(formula().value).toBe('1d6 + 1');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the dice for the next opening', () => {
    const first = renderDiceTray();
    fireEvent.click(die('d8'));
    expect(first.remembered().formula).toBe('1d8');
    const memory = first.remembered();
    cleanup();
    renderDiceTray({ memory });
    expect(formula().value).toBe('1d8');
  });

  it('announces what the tray holds once clicks and keys rest, never per keypress in the field', () => {
    vi.useFakeTimers();
    try {
      const { view } = renderDiceTray();
      const live = (): string => view.container.querySelector('.atlas-dice-tray__announce')?.textContent ?? '';
      fireEvent.click(die('d6'));
      fireEvent.click(die('d6, 1 in the tray'));
      fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }));
      expect(live()).toBe('');
      act(() => { vi.advanceTimersByTime(500); });
      expect(live()).toBe('In the tray: 2d6 + 1');
      fireEvent.change(formula(), { target: { value: '4d6kh3' } });
      act(() => { vi.advanceTimersByTime(1000); });
      expect(live()).toBe('In the tray: 2d6 + 1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('speaks a refused formula once typing pauses, and not again while the same error stands', () => {
    vi.useFakeTimers();
    try {
      renderDiceTray();
      const spoken = (): string => screen.getByRole('status').textContent ?? '';
      fireEvent.change(formula(), { target: { value: '1d20+b' } });
      fireEvent.change(formula(), { target: { value: '1d20+ba' } });
      act(() => { vi.advanceTimersByTime(200); });
      fireEvent.change(formula(), { target: { value: '1d20+banana' } });
      expect(spoken()).toBe('');
      act(() => { vi.advanceTimersByTime(500); });
      expect(spoken()).toBe('“banana” is not a die or a number');
      fireEvent.change(formula(), { target: { value: '1d20+banana ' } });
      act(() => { vi.advanceTimersByTime(500); });
      expect(spoken()).toBe('“banana” is not a die or a number');
    } finally {
      vi.useRealTimers();
    }
  });

  it('switches showing the rolls to players with S, never in the field and never on the map', () => {
    const onToggle = vi.fn();
    renderDiceTray({ shareRolls: { shown: false, onToggle } });
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    fireEvent.keyDown(document.body, { key: 's' });
    window.removeEventListener('keydown', heard);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(heard).not.toHaveBeenCalled();
    fireEvent.keyDown(formula(), { key: 's' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('says a modifier alone rolls nothing yet', () => {
    renderDiceTray();
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }));
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('');
    expect((screen.getByRole('button', { name: 'Roll' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes on Escape, and rolls on Enter outside it', () => {
    const { onClose, onRoll } = renderDiceTray();
    fireEvent.click(die('d20'));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onRoll).toHaveBeenCalledWith({ formula: '1d20', advantage: null });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps the modifier with + and − from anywhere but a text field, and keeps the keys from the map', () => {
    renderDiceTray();
    fireEvent.click(die('d20'));
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    fireEvent.keyDown(document.body, { key: '+', shiftKey: true });
    fireEvent.keyDown(die('d20, 1 in the tray'), { key: '+' });
    fireEvent.keyDown(document.body, { key: '-' });
    window.removeEventListener('keydown', heard);
    expect(formula().value).toBe('1d20 + 1');
    expect(heard).not.toHaveBeenCalled();
    fireEvent.keyDown(formula(), { key: '-' });
    expect(formula().value).toBe('1d20 + 1');
  });

  it('adds dice by their place with the number keys, and puts the caret in the field with /', () => {
    renderDiceTray();
    fireEvent.keyDown(document.body, { key: '6' });
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(formula().value).toBe('2d6 + 1d20');
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(formula());
    fireEvent.keyDown(formula(), { key: '3' });
    expect(formula().value).toBe('2d6 + 1d20');
  });

  it("keeps the roll history's row standing from the start, closed, so the first roll moves nothing", () => {
    renderDiceTray();
    const toggle = screen.getByRole('button', { name: /^Roll history/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Roll history' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Roll history' }).textContent).toBe('No rolls yet');
  });

  it('brings cleared dice back with Restore until the next change', () => {
    renderDiceTray();
    fireEvent.click(die('d6'));
    fireEvent.click(die('d6, 1 in the tray'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(formula().value).toBe('');
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('Tray cleared · Restore');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(formula().value).toBe('2d6');
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(die('d4'));
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('names the part of a formula that is wrong, in one line', () => {
    renderDiceTray();
    fireEvent.change(formula(), { target: { value: '1d20+banana' } });
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('“banana” is not a die or a number');
    fireEvent.change(formula(), { target: { value: '2d6 +' } });
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('The formula is not finished');
  });

  it('says where the GM looks why the dice take no more', () => {
    renderDiceTray({ memory: { formula: '20d4 + 20d6 + 20d8 + 20d10 + 20d12', side: 'normal' } });
    expect(document.querySelector('.atlas-dice-tray__message')?.textContent).toBe('100 dice: the most one roll holds');
  });
});
