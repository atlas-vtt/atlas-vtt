// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { linkNoteDice } from '../../src/app/noteDice/noteDiceLinks';

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
    expect([...el.querySelectorAll<HTMLElement>('.atlas-dice-link')].map((link) => link.dataset.formula))
      .toEqual(['2d6+3', 'd20', '+4', '4d6kh3', '2d8']);
    expect(el.querySelector('code .atlas-dice-link')?.textContent).toBe('4d6kh3');
    expect(el.textContent).toContain('Bonus +4.');
    expect(el.querySelector('a')?.textContent).toBe('1d6');
    expect(el.querySelector('pre code')?.textContent).toBe('dice: 1d4');
    expect(linkNoteDice(el)).toBe(false);
  });

  it('links signed modifiers in prose and marked code without linking unsigned numbers', () => {
    const el = section('<p>Strength +3, Dexterity −2, level 3, CR 1/4. <code>dice: +3</code> <code>+3</code></p>');
    expect(linkNoteDice(el)).toBe(true);
    expect([...el.querySelectorAll<HTMLElement>('.atlas-dice-link')].map((link) => link.dataset.formula))
      .toEqual(['+3', '-2', '+3']);
    expect(el.querySelectorAll('code .atlas-dice-link')).toHaveLength(1);
    expect(linkNoteDice(el)).toBe(false);
  });

  it('leaves invalid explicit formulas, existing statblocks and ordinary code alone', () => {
    const el = section('<code>dice: 101d6</code><code>dice: 1d0</code><div class="atlas-statblock">1d8</div><div class="atlas-sb-markdown">1d4</div>');
    expect(linkNoteDice(el)).toBe(false);
    expect(el.querySelectorAll('.atlas-dice-link')).toHaveLength(0);
  });

  it.each([
    'd20', '-2D6 + 9999', '100d1000', '50d6+50d8', 'd6!99', 'd6!0',
    'd20*2', '(d20)', '4dF', 'dF', '((((((((1d6))))))))',
    '2d20kh1', '4d6kh3', '4d6k', '4d6kl1', '4d6d1', '4d6dl', '4d6dh2', '2d20kh1+5',
    '4d6r1kh3', '4d6ro<2', '4d6rr1', '2d10r>=9',
    '8d10x>=10cs>=8', '3d6x', '3d6xo', '3d6x>5',
    '3d6!', '3d6!3', '3d6!i', 'd6!!i',
    '5d10>=8', '5d10<=2', '5d10cf<3', '6d6cs=6', 'd%', '4dF',
    '2d6[fire]', "1d8[Sneak Attack]+1d6[it's cold]", '3[bonus]',
    '2d6*(1d4+2)/3', '-(1d6+2)', '+3', '3', '0d2', Array(20).fill('1').join('+'),
  ])('links the entire explicit formula %s', (formula) => {
    const el = section('<code></code>');
    el.querySelector('code')!.textContent = `dice: ${formula}`;
    expect(linkNoteDice(el)).toBe(true);
    const link = el.querySelector<HTMLElement>('.atlas-dice-link')!;
    expect(link.dataset.formula).toBe(formula);
    expect(link.textContent).toBe(formula);
    expect(linkNoteDice(el)).toBe(false);
  });

  it('respects the formula length limit without counting the prefix separator', () => {
    const el = section('<code></code>');
    el.querySelector('code')!.textContent = `dice: d20${' '.repeat(97)}`;
    expect(linkNoteDice(el)).toBe(true);
    expect(el.querySelector<HTMLElement>('.atlas-dice-link')!.dataset.formula).toBe('d20');
  });

  it.each(['dice: 4d6kh3 garbage', 'dice: 2d6kh3', 'dice: d20++2', 'dice: 1d6/0', 'dice: ', 'dice: d20\n', `dice: d20${' '.repeat(100)}`, 'version 2d6'])
  ('does not link a fragment of invalid code %s', (text) => {
    const el = section('<code></code>');
    el.querySelector('code')!.textContent = text;
    expect(linkNoteDice(el)).toBe(false);
    expect(el.textContent).toBe(text);
  });
});
