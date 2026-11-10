import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SectionHeader } from '../../src/app/packages/components/asset-manager/components/SectionHeader';
import { SelectionInfo } from '../../src/app/packages/components/asset-manager/components/SelectionInfo';

/** The Obsidian variables the row's sizes come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --input-height: 30px; --font-ui-small: 13px; --font-ui-smaller: 12px; --font-medium: 500;
    --radius-s: 4px; --radius-m: 8px; --font-interface: sans-serif; }
`;
/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;
const noop = (): void => undefined;

describe('the asset manager section header', () => {
  const style = document.createElement('style');
  style.textContent = OBSIDIAN;
  let host: HTMLElement;
  let root: Root;

  const show = (selected: number): HTMLElement => {
    flushSync(() => root.render(React.createElement(SectionHeader, {
      title: 'Tokens', count: 159, collapsed: false, onToggle: noop,
      end: React.createElement(SelectionInfo, { count: selected, onClear: noop }),
    })));
    const row = host.querySelector<HTMLElement>('.atlas-section-header-row');
    if (!row) throw new Error('the section header did not render');
    return row;
  };

  beforeEach(() => {
    document.head.append(style);
    host = document.createElement('div');
    host.className = 'atlas-vtt-plugin';
    host.style.width = '600px';
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    style.remove();
  });

  it('shows a selection at its end without growing', async () => {
    const height = show(0).getBoundingClientRect().height;
    expect(host.querySelector('.atlas-selection-info')).toBeNull();

    const row = show(12345);
    // It slides in; measure where it comes to rest.
    await Promise.all(row.getAnimations({ subtree: true }).map((animation) => animation.finished));
    const selection = row.querySelector<HTMLElement>('.atlas-selection-info')?.getBoundingClientRect();
    const toggle = row.querySelector<HTMLElement>('.atlas-section-header')?.getBoundingClientRect();
    if (!selection || !toggle) throw new Error('the selection did not render');
    expect(row.getBoundingClientRect().height).toBeCloseTo(height, 1);
    expect(Math.abs(selection.right - row.getBoundingClientRect().right)).toBeLessThanOrEqual(SLACK);
    expect(toggle.right).toBeLessThanOrEqual(selection.left + SLACK);
  });

  it('keeps the clear button out of the toggle', () => {
    const row = show(2);
    expect(row.querySelector('.atlas-section-header .atlas-clear-selection-btn')).toBeNull();
    expect(row.querySelector('.atlas-clear-selection-btn')).not.toBeNull();
  });
});
