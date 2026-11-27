import '../setup/obsidianDom';
import { createElement, useState } from 'react';
import { render, screen } from '@testing-library/react';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { SegmentedControl } from '../../src/app/packages/components/primitives/SegmentedControl';
import { attachDiceRolling } from '../../src/app/services/statblockDiceLinks';
import { ATLAS_VIEW_TYPE } from '../../src/app/atlasViewType';
import { DiceText } from '../../src/app/statblocks/render/shared/DiceText';
import { accountRig } from '../unit/online/gm/accountRig.ts';
import { control, dmScreen, handTimers, scriptedSession } from './gmScreenRig.ts';

let teardown = (): void => undefined;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(() => teardown());

/** A map on screen whose dice tool keeps what it was asked to roll, as the DM screen's rolls reach it. */
function mapRolls(rolled: string[]): App {
  const tool = { rollDice: (formula: string) => (rolled.push(formula), { formula }) };
  const view = { viewId: 'map', containerEl: document.body, serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) } };
  return { workspace: { getLeavesOfType: (type: string) => (type === ATLAS_VIEW_TYPE ? [{ view }] : []) } } as unknown as App;
}

/** The DM screen's page switch, as DMScreen draws it in its header. */
function Pages({ turned }: { turned: string[] }): React.JSX.Element {
  const [page, setPage] = useState<'statblocks' | 'sound'>('statblocks');
  return createElement(SegmentedControl<'statblocks' | 'sound'>, {
    value: page,
    options: [{ value: 'statblocks', label: 'Statblocks' }, { value: 'sound', label: 'Sound' }],
    onChange: (next) => (turned.push(next), setPage(next)),
    ariaLabel: 'Pages',
  });
}

describe('Sidekick\'s panel over the DM screen, pressed outside with the real mouse', () => {
  it('closes on a press on a dice link or a button of the screen, which fires neither; the next press does', async () => {
    const view = await dmScreen('dark');
    teardown = view.remove;
    const rolled: string[] = [];
    const turned: string[] = [];
    const stage = view.leaf.querySelector<HTMLElement>('.atlas-dm-screen-stage')!;
    stage.style.cssText = 'position: absolute; inset: 120px 0 0 600px';
    render(createElement('p', { className: 'atlas-sb-trait' }, createElement(DiceText, { text: 'Bite. 2d6+3 piercing' })), { container: stage });
    const stop = attachDiceRolling(stage, mapRolls(rolled), () => ({}));
    const header = view.leaf.querySelector<HTMLElement>('.atlas-dm-screen-header')!;
    header.querySelector('.atlas-segmented')?.remove();
    render(createElement(Pages, { turned }), { container: header.appendChild(document.createElement('div')) });
    const { session } = scriptedSession(handTimers());
    const account = accountRig('bearer-token');
    await account.control.refresh();
    control(view.leaf, session, account);
    const sidekick = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-gm-screen-control__button')!;
    const open = async (): Promise<void> => {
      await userEvent.click(sidekick());
      expect(screen.getByRole('dialog', { name: 'Sidekick' })).toBeTruthy();
    };
    const dice = screen.getByRole('button', { name: /2d6\+3/ });
    const sound = screen.getByRole('radio', { name: 'Sound' });

    await open();
    await userEvent.click(dice);
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(rolled).toEqual([]);
    await userEvent.click(dice);
    expect(rolled).toEqual(['2d6+3']);

    await open();
    await userEvent.click(sound);
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(turned).toEqual([]);
    await userEvent.click(sound);
    expect(turned).toEqual(['sound']);

    await open();
    await userEvent.click(sidekick());
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    expect(sidekick().getAttribute('aria-expanded')).toBe('false');
    stop();
  });
});
