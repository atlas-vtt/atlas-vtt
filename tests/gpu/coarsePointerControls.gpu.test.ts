import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { CloseButton } from '../../src/app/packages/components/primitives/CloseButton';
import { SegmentedControl } from '../../src/app/packages/components/primitives/SegmentedControl';
import { Select } from '../../src/app/packages/components/primitives/Select';
import { ToggleSwitch } from '../../src/app/packages/components/primitives/Toggle';
import { DASHBOARD_THEME } from './dashboardTheme';

/**
 * The shared controls under a fine and a coarse pointer, styled by the plugin's real stylesheet. A coarse pointer is
 * the mark on the body alone (`data-atlas-pointer`): the sizes are custom properties it sets, so nothing else differs.
 */
const h = React.createElement;
const OPTIONS = [{ value: 'a', label: 'Square' }, { value: 'b', label: 'Hexes, pointy' }, { value: 'c', label: 'Hexes, flat' }];

describe('the shared controls under a fine and a coarse pointer', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;

  beforeEach(async () => {
    await page.viewport(900, 600);
    document.head.append(style);
    document.body.className = 'theme-dark';
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.className = '';
    document.body.removeAttribute('data-atlas-pointer');
  });

  function mount(): void {
    const nothing = (): void => undefined;
    render(h('div', { className: 'atlas-vtt-plugin atlas-vtt-root', style: { position: 'fixed', left: 40, top: 40, width: 420 } },
      // A panel as every dialog sets it up: its radius, and a header that ends in the close button.
      h('div', { className: 'atlas-modal', 'data-testid': 'panel', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 } },
        h('div', { className: 'atlas-modal-header', 'data-testid': 'header', style: { alignSelf: 'stretch' } }, h('span', null, 'Grid'), h(CloseButton, { onClick: nothing })),
        h('span', { id: 'grid-type' }, 'Type'),
        h(Select, { value: 'a', options: OPTIONS, onChange: nothing, labelledBy: 'grid-type' }),
        h(SegmentedControl, { value: 'a', options: OPTIONS, onChange: nothing, ariaLabel: 'Type' }),
        h(ToggleSwitch, { value: true, onChange: nothing, size: 's', 'aria-label': 'Snap' }),
        h(ToggleSwitch, { value: false, onChange: nothing, size: 'xs', 'aria-label': 'Lock' }),
        h('input', { type: 'checkbox', 'aria-label': 'Numbers' }))));
  }

  const size = (element: Element | null): number[] => {
    const { width, height } = element!.getBoundingClientRect();
    return [Math.round(width * 10) / 10, Math.round(height * 10) / 10];
  };

  async function sizes(): Promise<Record<string, number[] | string>> {
    const close = document.querySelector('.atlas-close-btn')!;
    const header = screen.getByTestId('header').getBoundingClientRect();
    const closeBox = close.getBoundingClientRect();
    await userEvent.click(document.querySelector('.atlas-select-trigger')!);
    const option = document.querySelector<HTMLElement>('.atlas-select-option')!;
    const result = {
      close: size(close),
      // above the button, and after it: the panel's one gap
      closeGap: [closeBox.top - header.top, header.right - closeBox.right],
      closeCorner: getComputedStyle(close).borderTopRightRadius,
      select: [size(document.querySelector('.atlas-select-trigger'))[1]!],
      // Its laid-out height: the list is still scaling in.
      option: [option.offsetHeight],
      segmented: [size(document.querySelector('.atlas-segmented'))[1]!],
      small: size(document.querySelector('.atlas-toggle--s .atlas-toggle__switch')),
      smallThumb: size(document.querySelector('.atlas-toggle--s .atlas-toggle__thumb')),
      tiny: size(document.querySelector('.atlas-toggle--xs .atlas-toggle__switch')),
      checkbox: getComputedStyle(document.querySelector('input[type="checkbox"]')!).getPropertyValue('--checkbox-size').trim(),
    };
    await userEvent.keyboard('{Escape}');
    return result;
  }

  /** The hit area of `selector`: its own box grown by its `::before`, which is drawn by nothing. */
  const hitArea = (selector: string): number[] => {
    const element = document.querySelector(selector)!;
    const hit = getComputedStyle(element, '::before');
    const { width, height } = element.getBoundingClientRect();
    if (hit.content === 'none') return [width, height];
    return [width - parseFloat(hit.left) - parseFloat(hit.right), height - parseFloat(hit.top) - parseFloat(hit.bottom)];
  };

  it('gives a fine pointer the dense sizes it always had', async () => {
    mount();
    expect(await sizes()).toEqual({
      close: [30, 30], closeGap: [4, 4], closeCorner: '10px', select: [30], option: [30], segmented: [48],
      small: [36, 20], smallThumb: [12, 12], tiny: [28, 16], checkbox: '',
    });
    expect(hitArea('.atlas-toggle--s')).toEqual([36, 20]);
  });

  it('gives a coarse pointer 44 px to close, 40 px fields and rows, 44 px options, and larger switches and checkboxes in 44 px hit areas, with the same gaps and corners', async () => {
    act(() => document.body.setAttribute('data-atlas-pointer', 'coarse'));
    mount();
    expect(await sizes()).toEqual({
      close: [44, 44], closeGap: [4, 4], closeCorner: '10px', select: [40], option: [40], segmented: [52],
      small: [50, 28], smallThumb: [20, 20], tiny: [42, 24], checkbox: '24px',
    });
    expect(hitArea('.atlas-toggle--s')).toEqual([50, 44]);
    expect(hitArea('.atlas-toggle--xs')).toEqual([44, 44]);
    const box = document.querySelector<HTMLElement>('input[type="checkbox"]')!;
    // Obsidian's own stylesheet sizes the box from the property; here the box stands in at that size.
    box.style.cssText = 'position: relative; width: var(--checkbox-size); height: var(--checkbox-size); margin: 0;';
    expect(hitArea('input[type="checkbox"]')).toEqual([44, 44]);
  });
});
