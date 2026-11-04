import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocationBar } from '../../src/app/packages/components/asset-manager/components/LocationBar';
import type { Folder } from '../../src/app/packages/components/asset-manager/types';

/** The Obsidian variables the row's sizes come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --input-height: 30px; --font-ui-small: 13px; --font-ui-smaller: 12px; --font-medium: 500;
    --radius-s: 4px; --radius-m: 8px; --font-interface: sans-serif; }
`;
/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;
const noop = (): void => undefined;

function folders(count: number): Folder[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `folder-${index}`, name: `A folder with a long name ${index}`, type: 'tokens', path: `folder-${index}`,
  }));
}

describe('the asset manager location bar', () => {
  const style = document.createElement('style');
  style.textContent = OBSIDIAN;
  let host: HTMLElement;
  let root: Root;

  const show = (width: number, depth: number): HTMLElement => {
    host.style.width = `${width}px`;
    flushSync(() => root.render(React.createElement(LocationBar, {
      activeTab: 'tokens',
      path: folders(depth),
      onNavigateToFolder: noop,
      sort: { sortBy: 'name', sortOptions: ['name', 'date', 'type', 'rating'], setSortBy: noop, sortOrder: 'asc', setSortOrder: noop },
    })));
    const bar = host.querySelector<HTMLElement>('.atlas-asset-manager-location');
    if (!bar) throw new Error('the location bar did not render');
    return bar;
  };

  beforeEach(() => {
    document.head.append(style);
    host = document.createElement('div');
    host.className = 'atlas-vtt-plugin';
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    style.remove();
  });

  it.each([[1000, 0], [1000, 3], [420, 0], [420, 4]])('keeps the sort at its end and clear of the breadcrumb at %ipx with %i folders open', (width, depth) => {
    const bar = show(width, depth);
    const inner = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
    const sort = bar.querySelector<HTMLElement>('.atlas-am-sort')?.getBoundingClientRect();
    const breadcrumb = bar.querySelector<HTMLElement>('.atlas-asset-manager-breadcrumb')?.getBoundingClientRect();
    if (!sort || !breadcrumb) throw new Error('the location bar did not render its parts');
    expect(Math.abs(sort.right - inner)).toBeLessThanOrEqual(SLACK);
    expect(breadcrumb.right).toBeLessThanOrEqual(sort.left + SLACK);
    expect(bar.getBoundingClientRect().height).toBeLessThan(60);
  });

  it('stands the current sort label next to the order button', () => {
    const bar = show(1000, 0);
    const label = bar.querySelector<HTMLElement>('.atlas-am-sort-stack .atlas-current')?.getBoundingClientRect();
    const field = bar.querySelector<HTMLElement>('.atlas-am-sort-field');
    if (!label || !field) throw new Error('the sort did not render');
    const fieldRight = field.getBoundingClientRect().right - parseFloat(getComputedStyle(field).paddingRight);
    expect(Math.abs(label.right - fieldRight)).toBeLessThanOrEqual(1);
  });
});
