// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { linkNoteDice } from '../../src/app/noteDice/noteDiceLinks';
import { noteDiceProcessor } from '../../src/app/noteDice/registerNoteDiceRolling';
import type { NoteDiceDisplays } from '../../src/app/noteDice/NoteDiceDisplays';
import type { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type { NoteDiceMenus } from '../../src/app/noteDice/NoteDiceMenus';
import type { RollChoice } from '../../src/app/services/statblockDiceLinks';

function section(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe('note dice links', () => {
  it('links dice in prose and explicitly marked inline code, leaving other content intact', () => {
    const el = section('<p>Hit 2d6+3 or d20. Bonus +4. <code>dice: 4d6kh3</code> <code>2d8</code> <a href="#">1d6</a></p><pre><code>dice: 1d4</code></pre>');
    expect(linkNoteDice(el)).toBe(true);
    expect([...el.querySelectorAll<HTMLElement>('.atlas-note-dice-link')].map((link) => link.dataset.formula))
      .toEqual(['2d6+3', 'd20', '+4', '4d6kh3']);
    expect(el.querySelector('code .atlas-note-dice-link')?.textContent).toBe('dice: 4d6kh3');
    expect(el.textContent).toContain('Bonus +4.');
    expect(el.querySelector('a')?.textContent).toBe('1d6');
    expect(el.querySelector('pre code')?.textContent).toBe('dice: 1d4');
    expect(linkNoteDice(el)).toBe(false);
  });

  it('links signed modifiers in prose and marked code without linking unsigned numbers', () => {
    const el = section('<p>Strength +3, Dexterity −2, level 3, CR 1/4. <code>dice: +3</code> <code>+3</code></p>');
    expect(linkNoteDice(el)).toBe(true);
    expect([...el.querySelectorAll<HTMLElement>('.atlas-note-dice-link')].map((link) => link.dataset.formula))
      .toEqual(['+3', '-2', '+3']);
    expect(el.querySelectorAll('code .atlas-note-dice-link')).toHaveLength(1);
    expect(linkNoteDice(el)).toBe(false);
  });

  it('leaves invalid explicit formulas, existing statblocks and ordinary code alone', () => {
    const el = section('<code>dice: 101d6</code><code>dice: 1d0</code><code>1d20</code><div class="atlas-statblock">1d8</div><div class="atlas-sb-markdown">1d4</div>');
    expect(linkNoteDice(el)).toBe(false);
    expect(el.querySelectorAll('.atlas-note-dice-link')).toHaveLength(0);
  });

  it('routes clicks and keyboard presses and removes listeners on unload', () => {
    const el = section('<p>Attack 1d20+2 and +3</p>');
    const roll = vi.fn();
    const displays = { roll } as unknown as NoteDiceDisplays;
    let child: MarkdownRenderChild | undefined;
    const ctx = { addChild: (value: MarkdownRenderChild) => { child = value; value.onload(); } } as MarkdownPostProcessorContext;
    const menus = { closeWithin: vi.fn() } as unknown as NoteDiceMenus;
    noteDiceProcessor(displays, menus)(el, ctx);
    const link = el.querySelector<HTMLElement>('.atlas-note-dice-link')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    link.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', altKey: true }));
    expect(roll).toHaveBeenNthCalledWith(1, document, '1d20+2', 'advantage');
    expect(roll).toHaveBeenNthCalledWith(2, document, '1d20+2', 'disadvantage');
    el.querySelectorAll<HTMLElement>('.atlas-note-dice-link')[1]!.click();
    expect(roll).toHaveBeenNthCalledWith(3, document, '+3', null);
    child!.unload();
    link.click();
    expect(roll).toHaveBeenCalledTimes(3);
  });

  it('opens the roll menu in the note document and rolls the selected choice', () => {
    const el = section('<p>Check +3 and damage 2d6</p>');
    const roll = vi.fn();
    const advantageSides = vi.fn((formula: string) => formula === '+3' ? ['advantage', 'disadvantage'] : []);
    const displays = { roll, advantageSides } as unknown as NoteDiceDisplays;
    let child: MarkdownRenderChild | undefined;
    const ctx = { addChild: (value: MarkdownRenderChild) => { child = value; value.onload(); } } as MarkdownPostProcessorContext;
    const open = vi.fn();
    const closeWithin = vi.fn();
    const menus = { open, closeWithin } as unknown as NoteDiceMenus;
    noteDiceProcessor(displays, menus)(el, ctx);
    const [bonus, damage] = el.querySelectorAll<HTMLElement>('.atlas-note-dice-link');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 123, clientY: 45 });
    bonus!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith(expect.any(Array), { x: 123, y: 45 }, bonus);
    expect(advantageSides).toHaveBeenCalledWith('+3');
    const choices = open.mock.calls[0]![0] as RollChoice[];
    expect(choices.map((choice) => choice.label)).toEqual(['Roll', 'Roll with advantage', 'Roll with disadvantage']);
    choices[1]!.roll();
    choices[2]!.roll();
    expect(roll).toHaveBeenNthCalledWith(1, document, '+3', 'advantage');
    expect(roll).toHaveBeenNthCalledWith(2, document, '+3', 'disadvantage');

    vi.spyOn(damage!, 'getBoundingClientRect').mockReturnValue({ left: 10, bottom: 20 } as DOMRect);
    damage!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenLastCalledWith(expect.any(Array), { x: 10, y: 20 }, damage);
    expect(open.mock.calls[1]![0]).toHaveLength(1);
    child!.unload();
    expect(closeWithin).toHaveBeenCalledWith(el);
    open.mockClear();
    bonus!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
    expect(open).not.toHaveBeenCalled();
  });
});
