import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { mountRecoveryEditor, RECOVERY_THEME } from './recoveryPaneHarness';

// Dice links reach the map view and the token link service, whose Node `events` has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
const all = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
const frames = (count = 2): Promise<void> => new Promise((resolve) => {
  const step = (left: number): void => { if (left === 0) resolve(); else requestAnimationFrame(() => step(left - 1)); };
  step(count);
});
const spot = (name: RegExp) => page.getByRole('button', { name });
const press = async (keys: string): Promise<void> => {
  await userEvent.keyboard(keys);
  await frames();
};

describe('the recovery buttons in the template editor', () => {
  const style = document.createElement('style');
  style.textContent = RECOVERY_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(async () => {
    await page.viewport(1440, 900);
    document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('stacks the rail and the card in the card\'s column, one left edge, capsules one height', async () => {
    mountRecoveryEditor('light');
    await frames();
    const rail = rect('.atlas-rc-rail');
    const stage = rect('.atlas-rc-stage');
    expect(rail.bottom).toBeLessThan(stage.top);
    expect(stage.left).toBeCloseTo(rail.left, 0);
    expect(stage.right).toBeLessThanOrEqual(rect('.atlas-te-rests').right);
    const capsules = all('.atlas-rc-rail .atlas-rc-capsule, .atlas-rc-rail__add');
    expect(capsules).toHaveLength(3);
    for (const capsule of capsules) expect(capsule.height).toBeCloseTo(30, 0);
    expect(new Set(capsules.map((capsule) => Math.round(capsule.top))).size).toBe(1);
  });

  it('hangs one card 8 px under a picked metric\'s row, from its left edge, inside the stage, never on it', async () => {
    mountRecoveryEditor('dark');
    await userEvent.click(page.getByRole('button', { name: /^Long rest/ }));
    await userEvent.click(spot(/^Hit Dice:/));
    await frames();
    const stage = rect('.atlas-rc-stage');
    const metric = rect('.atlas-rc-spot.atlas-picked');
    const card = rect('.atlas-rc-card');
    expect(document.querySelectorAll('.atlas-rc-card')).toHaveLength(1);
    expect(card.top - metric.bottom).toBeCloseTo(8, 0);
    expect(card.left).toBeCloseTo(metric.left, 0);
    expect(card.left).toBeGreaterThanOrEqual(stage.left);
    expect(card.right).toBeLessThanOrEqual(stage.right);
    expect(card.bottom).toBeLessThanOrEqual(stage.bottom);
    // Nothing lies over the card's fields, once the card has come into view
    const input = page.getByRole('textbox', { name: 'At least' }).element();
    await expect.poll(() => {
      const box = input.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    }).toBe(input);
  });

  it('offers the kinds a resource or counters take, and a condition\'s two, the rule\'s own chosen', async () => {
    mountRecoveryEditor('dark');
    await userEvent.click(page.getByRole('button', { name: /^Long rest/ }));
    await userEvent.click(spot(/^Hit Dice:/));
    const kinds = (): string[] => [...document.querySelectorAll('.atlas-rc-card__kinds [role="radio"]')].map((radio) => radio.textContent ?? '');
    const chosen = (): string | null | undefined => document.querySelector('.atlas-rc-card__kinds [aria-checked="true"]')?.textContent;
    expect(kinds()).toEqual(['Full', 'Amount', '½Half', 'Set', 'Spend']);
    expect(chosen()).toBe('½Half');
    // One row, inside the card's padding, every word whole
    const row = rect('.atlas-rc-card__kinds');
    const body = rect('.atlas-rc-card__body');
    expect(row.right).toBeLessThanOrEqual(body.right - 8 + 0.5);
    for (const option of document.querySelectorAll<HTMLElement>('.atlas-rc-card__kinds [role="radio"]')) {
      const box = option.getBoundingClientRect();
      expect(box.top).toBeCloseTo(row.top + 4, 0);
      expect(box.right).toBeLessThanOrEqual(row.right - 4 + 0.5);
      expect(option.scrollWidth).toBeLessThanOrEqual(option.clientWidth);
    }

    // A kind with no fields leaves the card its head and kinds; a counters rule keeps its rows
    await userEvent.click(spot(/^HP: Full/));
    expect(chosen()).toBe('Full');
    expect(document.querySelector('.atlas-rc-card__fields')).toBeNull();
    await userEvent.click(page.getByRole('radio', { name: 'Amount' }));
    expect(page.getByRole('textbox', { name: 'Amount' }).element()).toBeTruthy();

    // A condition's card hangs over its chip, at the stage's foot
    await userEvent.click(spot(/^Exhaustion:/));
    await frames();
    expect(kinds()).toEqual(['Step', 'Clear']);
    expect(chosen()).toBe('Step');
    const chip = rect('.atlas-rc-spot.atlas-picked');
    const card = rect('.atlas-rc-card');
    // Clear of the badge on the chip's top edge
    const clearance = rect('.atlas-rc-chip--picked .atlas-rc-badge').top - card.bottom;
    expect(clearance).toBeGreaterThanOrEqual(7.5);
    expect(clearance).toBeLessThanOrEqual(10);
    expect(card.bottom).toBeLessThan(chip.top);
    expect(card.top).toBeGreaterThanOrEqual(rect('.atlas-rc-stage').top);
    await userEvent.click(page.getByRole('radio', { name: 'Clear' }));
    expect(document.querySelector('.atlas-rc-card__fields')).toBeNull();
  });

  it('takes Escape back step by step: picking a source, the card, the metric, then leaves it to the editor', async () => {
    const onClose = vi.fn();
    mountRecoveryEditor('dark', undefined, onClose);
    await userEvent.click(page.getByRole('button', { name: /^Long rest/ }));
    await userEvent.click(spot(/^Stress: →/));
    await userEvent.click(page.getByRole('radio', { name: 'Spend' }));
    expect(document.querySelector('.atlas-rc-card')).toBeNull();

    await press('{Escape}');
    expect(document.querySelector('.atlas-rc-card')).not.toBeNull();
    expect(document.activeElement).toBe(page.getByRole('radio', { name: 'Set' }).element());
    await press('{Escape}');
    expect(document.querySelector('.atlas-rc-card')).toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Stress:/);
    expect(document.querySelector('.atlas-rc-spot.atlas-picked')).not.toBeNull();
    await press('{Escape}');
    expect(document.querySelector('.atlas-rc-spot.atlas-picked')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await press('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sets up a Long rest from the keyboard alone', async () => {
    const harness = mountRecoveryEditor('dark', []);
    await frames();
    page.getByRole('button', { name: 'Add a recovery action' }).element().focus();

    await press('{Enter}');
    expect(document.activeElement).toBe(page.getByRole('textbox', { name: 'Recovery action name' }).element());
    await press('Long rest{Enter}');
    expect(document.activeElement?.textContent).toBe('Long rest');

    // Past Add, Always and Add a step to the card: hit points back to full, the rule a metric starts with
    await press('{Tab}{Tab}{Tab}{Tab}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('HP: not given back');
    await press('{Enter}');
    expect(document.activeElement).toBe(page.getByRole('radio', { name: 'Full' }).element());
    await press('{Escape}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('HP: Full');

    // Stress set to 0: the arrows walk the kinds, Enter chooses, Tab goes on into the fields
    await press('{ArrowDown}{Enter}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}');
    await press('{Tab}');
    expect(document.activeElement).toBe(page.getByRole('textbox', { name: 'Set to' }).element());
    await press('{Escape}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Stress: → 0');

    // Half the Hit Dice
    await press('{ArrowDown}{Enter}{ArrowRight}{ArrowRight}{Enter}{Escape}');

    // Features back to full, and Exhaustion one step down
    await press('{ArrowDown}{Enter}{Escape}{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Exhaustion: not given back');
    await press('{Enter}{Escape}');

    const [long] = harness.buttons();
    expect(long!.name).toBe('Long rest');
    expect(long!.rules).toEqual([
      { target: { kind: 'resource', field: 'hp' }, does: 'full' },
      { target: { kind: 'resource', field: 'stress' }, does: 'set', to: 0 },
      { target: { kind: 'counters', field: 'hit_dice', rows: 'all' }, does: 'share', share: 0.5, round: 'down' },
      { target: { kind: 'counters', field: 'features', rows: 'all' }, does: 'full' },
      { target: { kind: 'condition', id: 'exhaustion' }, does: 'step', by: -1 },
    ]);
  });

  it('removes a metric from the button with the card\'s Remove', async () => {
    const harness = mountRecoveryEditor('dark');
    await userEvent.click(page.getByRole('button', { name: /^Long rest/ }));
    await userEvent.click(spot(/^Stress: →/));
    await userEvent.click(page.getByRole('button', { name: 'Remove from Long rest' }));
    expect(document.querySelector('.atlas-rc-card')).toBeNull();
    const long = harness.buttons()[1]!;
    expect(long.rules.some((rule) => rule.target.kind === 'resource' && rule.target.field === 'stress')).toBe(false);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Stress: not given back');
  });

  it('renames a button in place, and Delete removes it, focus going to the next', async () => {
    const harness = mountRecoveryEditor('dark');
    await userEvent.dblClick(page.getByRole('button', { name: /^Short rest/ }));
    await press('Catch breath{Enter}');
    expect(harness.buttons()[0]!.name).toBe('Catch breath');
    expect(document.activeElement?.textContent).toContain('Catch breath');
    await press('{Delete}');
    expect(harness.buttons().map((button) => button.name)).toEqual(['Long rest']);
    expect(document.activeElement?.textContent).toContain('Long rest');
    // The removed button's id is gone from every counters rule
    expect(JSON.stringify(harness.buttons())).not.toContain('rest-short1');
  });

  it('moves a button with Alt and an arrow', async () => {
    const harness = mountRecoveryEditor('dark');
    page.getByRole('button', { name: /^Long rest/ }).element().focus();
    await press('{Alt>}{ArrowLeft}{/Alt}');
    expect(harness.buttons().map((button) => button.name)).toEqual(['Long rest', 'Short rest']);
    expect(document.activeElement?.textContent).toContain('Long rest');
  });

  it('picks what a Spend rule spends with the next metric', async () => {
    const harness = mountRecoveryEditor('dark');
    await userEvent.click(page.getByRole('button', { name: /^Long rest/ }));
    await userEvent.click(spot(/^Stress: →/));
    await userEvent.click(page.getByRole('radio', { name: 'Spend' }));
    expect(document.querySelector('.atlas-rc-prompt')?.textContent).toContain('Pick what is spent');
    expect(document.querySelector('.atlas-rc-card')).toBeNull();
    expect(document.querySelectorAll('.atlas-rc-spot.atlas-source').length).toBeGreaterThan(0);
    await userEvent.click(spot(/^Hit Dice:/));
    const rule = harness.buttons()[1]!.rules.find((each) => each.target.kind === 'resource' && each.target.field === 'stress');
    expect(rule).toEqual({ target: { kind: 'resource', field: 'stress' }, does: 'spend', from: { kind: 'counters', field: 'hit_dice', rows: 'all' }, each: '1' });
    expect(page.getByRole('textbox', { name: 'Each one gives back' }).element()).toBeTruthy();
    expect(document.querySelector('.atlas-rc-card__kinds [aria-checked="true"]')?.textContent).toBe('Spend');
  });

  it('says why a number that is no token resource cannot be picked', async () => {
    mountRecoveryEditor('dark');
    await userEvent.hover(document.querySelector<HTMLElement>('[data-block-id="statac01"] .atlas-rc-spot--refused')!);
    await expect.poll(() => document.querySelector('[role="tooltip"]')?.textContent).toContain('Not tracked');
  });
});
