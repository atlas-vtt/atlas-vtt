import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import looks from '../../styles/looks/atlas-looks.css?inline';
import { DropdownMenu } from '../../src/app/packages/components/primitives/DropdownMenu';

const THEME = 'body { margin: 0; background: #1e1e1e; --background-primary: #1e1e1e; --mono-100: #fff; }';
const h = React.createElement;

/** A bar of the map as the tools' bars are, holding one menu of Atlas's own, open or not. */
function bar(name: string, open: boolean): React.ReactElement {
  return h('div', { className: `atlas-tool-bar ${name}`, style: { position: 'absolute', left: 40, top: 200, padding: 4 } },
    h(DropdownMenu, { isOpen: open, onToggle: () => undefined, label: 'Colour', position: 'top' }, h('div', { style: { width: 120, height: 40 } })));
}

/** What stands between an element and the page that a backdrop blur cannot see past. */
function backdropRootsAbove(element: Element): string[] {
  const roots: string[] = [];
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.backdropFilter !== 'none' || style.filter !== 'none' || style.opacity !== '1' || style.mixBlendMode !== 'normal') roots.push(parent.className);
  }
  return roots;
}

const alphaOf = (color: string): number => Number(/\/\s*([\d.]+)\)$/.exec(color)?.[1] ?? (color.startsWith('rgba') ? color.split(',')[3]?.replace(')', '') : 1));

describe('a menu that hangs from a glass bar', () => {
  const style = document.createElement('style');
  style.textContent = THEME + looks;

  beforeEach(() => {
    document.head.append(style);
    document.body.className = 'theme-dark atlas-look atlas-look-glass';
    render(h('div', { className: 'atlas-vtt-plugin' }, bar('shut', false), bar('open', true)));
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.className = '';
  });

  it('is glass itself, with nothing above it that its blur could not see past', () => {
    const shut = getComputedStyle(document.querySelector('.atlas-tool-bar.shut')!);
    expect(shut.backdropFilter).toContain('blur');

    const menu = document.querySelector('.atlas-tool-bar.open .atlas-dropdown-content')!;
    const glass = getComputedStyle(menu);
    expect(glass.backdropFilter).toBe(shut.backdropFilter);
    expect(glass.backgroundColor).toBe(shut.backgroundColor);
    expect(alphaOf(glass.backgroundColor)).toBeLessThan(1);
    expect(backdropRootsAbove(menu)).toEqual([]);
  });

  it('leaves its bar looking as it did: the bar\'s glass lies on a layer of the bar\'s own, on its padding box', () => {
    const shut = getComputedStyle(document.querySelector('.atlas-tool-bar.shut')!);
    const open = document.querySelector<HTMLElement>('.atlas-tool-bar.open')!;
    const layer = getComputedStyle(open, '::before');
    expect(layer.backdropFilter).toBe(shut.backdropFilter);
    expect(layer.backgroundColor).toBe(shut.backgroundColor);
    expect(alphaOf(getComputedStyle(open).backgroundColor)).toBe(0);
    expect([layer.top, layer.right, layer.bottom, layer.left]).toEqual(['0px', '0px', '0px', '0px']);
    // Behind what the bar holds, and nothing of it takes a press
    expect(layer.zIndex).toBe('-1');
    expect(layer.pointerEvents).toBe('none');
    expect(getComputedStyle(open).isolation).toBe('isolate');
  });

  it('wears the Sci-fi look\'s lines as its bar does', () => {
    document.body.classList.add('atlas-look-scifi');
    const shut = getComputedStyle(document.querySelector('.atlas-tool-bar.shut')!);
    expect(shut.backgroundImage).not.toBe('none');
    const open = document.querySelector('.atlas-tool-bar.open')!;
    expect(getComputedStyle(open.querySelector('.atlas-dropdown-content')!).backgroundImage).toBe(shut.backgroundImage);
    expect(getComputedStyle(open, '::before').backgroundImage).toBe(shut.backgroundImage);
    expect(getComputedStyle(open).backgroundImage).toBe('none');
  });

  it('stays as it is without Transparency', () => {
    document.body.className = 'theme-dark atlas-look atlas-look-scifi';
    const open = document.querySelector('.atlas-tool-bar.open')!;
    expect(getComputedStyle(open.querySelector('.atlas-dropdown-content')!).backdropFilter).toBe('none');
    expect(getComputedStyle(open, '::before').content).toBe('none');
  });
});
