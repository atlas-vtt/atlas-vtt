import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { Header, type HeaderProps } from '../../src/app/packages/components/asset-manager/components/Header';
import { NavigationHistory } from '../../src/app/packages/components/asset-manager/NavigationHistory';

/** The Obsidian variables the header's sizes come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --input-height: 30px; --font-ui-small: 13px; --font-ui-smaller: 12px; --font-medium: 500;
    --radius-s: 4px; --radius-m: 8px; --font-interface: sans-serif; }
`;
/** Every control of the toolbar that takes room of its own; the controls inside one are part of it. */
const CONTROLS = 'button, nav, .atlas-asset-manager-search';
const WHOLES = 'nav, .atlas-asset-manager-search';
/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;

const noop = (): void => undefined;

function headerProps(tokens: number): HeaderProps {
  return {
    app: new App(),
    search: '',
    onSearch: noop,
    query: { suggestionsFor: () => null, commit: (text) => text, chips: [], activeCount: 0, panel: null, reset: noop },
    activeTab: 'tokens',
    onTabChange: noop,
    assetCounts: { scenes: 12, maps: 34, encounters: 5, tokens, party: 4 },
    onCreateFolder: noop,
    sidebarToggleLabel: 'Hide sidebar',
    onToggleSidebar: noop,
    sel: {
      navigationHistory: new NavigationHistory(),
      handleNavigateBack: noop,
      handleNavigateForward: noop,
    },
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** The controls on screen. The search field that opens over the row while focused is not one of the row. */
function shownControls(header: HTMLElement): HTMLElement[] {
  return Array.from(header.querySelectorAll<HTMLElement>(CONTROLS)).filter((control) => (
    control.getClientRects().length > 0
    && !control.parentElement?.closest(WHOLES)
    && getComputedStyle(control).position !== 'absolute'
  ));
}

/** What is wrong with the header's layout, as readable lines; empty when its controls sit side by side inside it. */
function layoutProblems(header: HTMLElement): string[] {
  const bounds = header.getBoundingClientRect();
  const controls = shownControls(header).map((control) => ({ name: control.className, rect: control.getBoundingClientRect() }));
  const problems: string[] = [];
  if (controls.length < 5) problems.push(`only ${controls.length} controls found`);
  controls.forEach((a, index) => {
    if (a.rect.left < bounds.left - SLACK || a.rect.right > bounds.right + SLACK) problems.push(`${a.name} leaves the header`);
    for (const b of controls.slice(index + 1)) {
      const apart = a.rect.right <= b.rect.left + SLACK || b.rect.right <= a.rect.left + SLACK
        || a.rect.bottom <= b.rect.top + SLACK || b.rect.bottom <= a.rect.top + SLACK;
      if (!apart) problems.push(`${a.name} overlaps ${b.name}`);
    }
  });
  return problems;
}

describe('the asset manager header', () => {
  const style = document.createElement('style');
  style.textContent = OBSIDIAN;
  let host: HTMLElement;
  let root: Root;

  const show = async (width: number, tokens = 412): Promise<HTMLElement> => {
    host.style.width = `${width}px`;
    flushSync(() => root.render(React.createElement(Header, headerProps(tokens))));
    // Resize observers report between layout and paint.
    await nextFrame();
    await nextFrame();
    const header = host.querySelector<HTMLElement>('.atlas-asset-manager-header');
    if (!header) throw new Error('the header did not render');
    return header;
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

  it.each([
    ['small counts', 412],
    ['large counts', 98765],
  ])('keeps its controls apart and inside it at every width, with %s', async (_what, tokens) => {
    const problems: string[] = [];
    for (let width = 1500; width >= 280; width -= 12) {
      const header = await show(width, tokens);
      problems.push(...layoutProblems(header).map((problem) => `${width}px: ${problem}`));
    }
    expect(problems).toEqual([]);
  });

  it('follows its content, not only its width', async () => {
    const header = await show(860, 4);
    const before = shownControls(header).length;
    await show(860, 98765);
    expect(layoutProblems(header)).toEqual([]);
    await show(860, 4);
    expect(shownControls(header)).toHaveLength(before);
  });

  it('shows the tabs side by side when there is room and one row of controls when there is not', async () => {
    const wide = await show(1100);
    expect(wide.querySelector('.atlas-asset-manager-tabs')?.getClientRects()).toHaveLength(1);
    const narrow = await show(600);
    expect(narrow.querySelector('.atlas-asset-manager-tabs')?.getClientRects()).toHaveLength(0);
    const tops = new Set(shownControls(narrow).map((control) => Math.round(control.getBoundingClientRect().top + control.offsetHeight / 2)));
    expect(tops.size).toBe(1);
  });

  it.each([1500, 1200, 1000, 900])('puts the tabs right after the navigation and the search at its end at %ipx', async (width) => {
    const header = await show(width);
    const toolbar = header.querySelector<HTMLElement>('.atlas-am-toolbar');
    const navigation = header.querySelector<HTMLElement>('.atlas-am-toolbar-left')?.getBoundingClientRect();
    const tabs = header.querySelector<HTMLElement>('.atlas-asset-manager-tabs')?.getBoundingClientRect();
    const create = header.querySelector<HTMLElement>('.atlas-asset-manager-create-btn')?.getBoundingClientRect();
    if (!toolbar || !navigation || !tabs || !create) throw new Error('the header did not render its groups');
    expect(Math.abs(tabs.left - navigation.right - parseFloat(getComputedStyle(toolbar).columnGap))).toBeLessThanOrEqual(SLACK);
    expect(Math.abs(create.right - toolbar.getBoundingClientRect().right)).toBeLessThanOrEqual(SLACK);
  });

  it.each([1250, 1000, 870, 600, 400])('does not animate its controls while it fits again at %ipx', async (width) => {
    const header = await show(width);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const field = header.querySelector<HTMLElement>('.atlas-asset-manager-search');
    if (!field) throw new Error('the search field did not render');
    // Collapsed to a button, the field is the hidden overlay that fades in on focus.
    const opacity = getComputedStyle(field).opacity;
    expect(opacity).toBe(getComputedStyle(field).position === 'absolute' ? '0' : '1');

    flushSync(() => root.render(React.createElement(Header, headerProps(413))));
    expect(getComputedStyle(field).opacity).toBe(opacity);
    expect(header.getAnimations({ subtree: true })).toHaveLength(0);
  });

  it('keeps the focus on a control while it fits again', async () => {
    const header = await show(600);
    const trigger = header.querySelector<HTMLElement>('.atlas-am-tab-menu-trigger');
    trigger?.focus();
    expect(document.activeElement).toBe(trigger);
    await show(590, 413);
    await nextFrame();
    expect(document.activeElement).toBe(trigger);
  });
});
