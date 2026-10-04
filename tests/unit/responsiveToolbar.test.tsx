import React, { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Circle } from 'lucide-react';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { ResponsiveToolbar } from '../../src/app/packages/components/toolbar/ResponsiveToolbar';
import { ToolbarSpaceContext } from '../../src/app/packages/components/toolbar/toolbarSpace';
import type { ResponsiveToolbarItem } from '../../src/app/packages/components/toolbar/toolbarTypes';

// jsdom lays nothing out: every toolbar control and the overflow button measure 40px.
const CONTROL_WIDTH = 40;
let offsetWidth: PropertyDescriptor | undefined;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(() => {
  offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.matches('[data-toolbar-item], .atlas-toolbar-overflow, .atlas-toolbar-end') ? CONTROL_WIDTH : 0;
    },
  });
});

afterEach(() => {
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
});

interface ItemOptions { onSelect?: () => void; pinned?: boolean; active?: boolean; element?: React.ReactNode }

function makeItem(id: string, { onSelect = vi.fn(), pinned = false, active = pinned, element }: ItemOptions = {}): ResponsiveToolbarItem {
  return {
    id,
    kind: 'button',
    pinned,
    active,
    element: element ?? <button type="button">{`${id} button`}</button>,
    menuEntry: { icon: Circle, label: `${id} tool`, isActive: active, onSelect },
  };
}

interface BarProps { items: ResponsiveToolbarItem[]; space: number | null; end?: React.ReactNode; hiddenIds?: ReadonlySet<string>; editing?: boolean }

function Bar({ items, space, end, hiddenIds, editing }: BarProps): React.ReactElement {
  return (
    <TooltipProvider>
      <ToolbarSpaceContext.Provider value={space}>
        <ResponsiveToolbar items={items} end={end} {...(hiddenIds && { hiddenIds })} {...(editing !== undefined && { editing })} />
      </ToolbarSpaceContext.Provider>
    </TooltipProvider>
  );
}

const renderToolbar = (items: ResponsiveToolbarItem[], space: number | null, end?: React.ReactNode) => render(<Bar items={items} space={space} end={end} />);

const visibleIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-toolbar-item]:not([hidden])')).map((el) => el.dataset.toolbarItem ?? '');

const ITEMS = (): ResponsiveToolbarItem[] => ['move', 'fog', 'draw', 'measure', 'palette'].map((id) => makeItem(id));

const menuLabels = (): string[] => {
  fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
  const labels = within(screen.getByRole('menu')).getAllByRole('menuitem').map((el) => el.textContent ?? '');
  fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
  return labels;
};

describe('ResponsiveToolbar', () => {
  it('shows every control while nothing constrains its width', () => {
    const { container } = renderToolbar(ITEMS(), null);
    expect(visibleIds(container)).toEqual(['move', 'fog', 'draw', 'measure', 'palette']);
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull();
  });

  it('moves controls into the menu from the right', () => {
    // 130px: the overflow button (40) and two controls (80).
    const { container } = renderToolbar(ITEMS(), 130);
    expect(visibleIds(container)).toEqual(['move', 'fog']);

    const more = screen.getByRole('button', { name: 'More tools' });
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the end control last, after the overflow button, and reserves its width', () => {
    // 170px: the end control (40), the overflow button (40) and two controls (80).
    const { container } = renderToolbar(ITEMS(), 170, <button type="button">GM view</button>);
    expect(visibleIds(container)).toEqual(['move', 'fog']);

    const bar = container.querySelector('.atlas-vtt-toolbar')!;
    const lastTwo = Array.from(bar.children).slice(-2).map((el) => el.className);
    expect(lastTwo).toEqual(['atlas-toolbar-overflow', 'atlas-toolbar-end']);
    expect(within(bar.lastElementChild as HTMLElement).getByRole('button', { name: 'GM view' })).toBeTruthy();
  });

  it('never moves a pinned control into the menu', () => {
    const items = ITEMS().map((item) => (item.id === 'palette' ? makeItem('palette', { pinned: true }) : item));
    const { container } = renderToolbar(items, 130);
    expect(visibleIds(container)).toEqual(['move', 'palette']);
  });

  it('lists the controls that did not fit in the menu and selects one', () => {
    const selectDraw = vi.fn();
    const items = ITEMS().map((item) => (item.id === 'draw' ? makeItem('draw', { onSelect: selectDraw }) : item));
    renderToolbar(items, 130);

    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    const menu = screen.getByRole('menu', { name: 'More tools' });
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['draw tool', 'measure tool', 'palette tool']);

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'draw tool' }));
    expect(selectDraw).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu on a press outside it and on Escape', () => {
    renderToolbar(ITEMS(), 130);
    const more = screen.getByRole('button', { name: 'More tools' });

    fireEvent.click(more);
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(more);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus through the menu with the arrow keys', () => {
    renderToolbar(ITEMS(), 130);
    fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
    const [draw, measure, palette] = within(screen.getByRole('menu')).getAllByRole('menuitem');

    draw!.focus();
    fireEvent.keyDown(draw!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(measure);
    fireEvent.keyDown(measure!, { key: 'End' });
    expect(document.activeElement).toBe(palette);
    fireEvent.keyDown(palette!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(draw);
  });

  it('brings controls back when the bar gets room again', () => {
    const items = ITEMS();
    const view = renderToolbar(items, 130);
    view.rerender(<Bar items={items} space={400} />);
    expect(visibleIds(view.container)).toEqual(['move', 'fog', 'draw', 'measure', 'palette']);
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull();
  });

  it('measures hidden controls again once the bar is styled', () => {
    // Before the plugin's stylesheet applies, every control is a block as wide as the view.
    let controlWidth = 800;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.matches('[data-toolbar-item]')) return controlWidth;
        return this.matches('.atlas-toolbar-overflow, .atlas-toolbar-end') ? CONTROL_WIDTH : 0;
      },
    });
    const items = ITEMS();
    const view = renderToolbar(items, 400);
    expect(visibleIds(view.container)).toEqual([]);

    controlWidth = CONTROL_WIDTH;
    (view.container.querySelector('.atlas-vtt-toolbar') as HTMLElement).style.padding = '4px';
    view.rerender(<Bar items={items} space={400} />);
    expect(visibleIds(view.container)).toEqual(['move', 'fog', 'draw', 'measure', 'palette']);
  });
});

describe('ResponsiveToolbar with controls the user hid', () => {
  it('keeps them mounted but hidden, out of the fit and out of "More tools"', () => {
    const { container } = render(<Bar items={ITEMS()} space={130} hiddenIds={new Set(['fog'])} />);
    expect(container.querySelector('[data-toolbar-item="fog"]')?.hasAttribute('hidden')).toBe(true);
    expect(visibleIds(container)).toEqual(['move', 'draw']);
    expect(menuLabels()).toEqual(['measure tool', 'palette tool']);
  });

  it('keeps the state of a hidden control, since it stays mounted', () => {
    function Counter(): React.ReactElement {
      const [count, setCount] = useState(0);
      return <button type="button" onClick={() => setCount(count + 1)}>{`count ${count}`}</button>;
    }
    const items = ITEMS().map((item) => (item.id === 'fog' ? makeItem('fog', { element: <Counter /> }) : item));
    const view = render(<Bar items={items} space={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'count 0' }));

    view.rerender(<Bar items={items} space={null} hiddenIds={new Set(['fog'])} />);
    expect(visibleIds(view.container)).not.toContain('fog');
    view.rerender(<Bar items={items} space={null} hiddenIds={new Set()} />);
    expect(screen.getByRole('button', { name: 'count 1' })).toBeTruthy();
  });

  it('lets a hidden control visit its place once it becomes active, and leave when it is not', () => {
    const hidden = new Set(['fog']);
    const withFog = (active: boolean): ResponsiveToolbarItem[] => ITEMS().map((item) => (item.id === 'fog' ? makeItem('fog', { pinned: active }) : item));
    const view = render(<Bar items={withFog(false)} space={null} hiddenIds={hidden} />);
    expect(visibleIds(view.container)).toEqual(['move', 'draw', 'measure', 'palette']);

    view.rerender(<Bar items={withFog(true)} space={null} hiddenIds={hidden} />);
    expect(visibleIds(view.container)).toEqual(['move', 'fog', 'draw', 'measure', 'palette']);

    view.rerender(<Bar items={withFog(false)} space={null} hiddenIds={hidden} />);
    expect(visibleIds(view.container)).toEqual(['move', 'draw', 'measure', 'palette']);
  });

  it('does not let a control visit that was already active when it was hidden or first shown', () => {
    const activeMove = ITEMS().map((item) => (item.id === 'move' ? makeItem('move', { pinned: true }) : item));
    const view = render(<Bar items={activeMove} space={null} hiddenIds={new Set(['move'])} />);
    expect(visibleIds(view.container)).not.toContain('move');

    const shownMove = render(<Bar items={activeMove} space={null} />);
    shownMove.rerender(<Bar items={activeMove} space={null} hiddenIds={new Set(['move'])} />);
    expect(visibleIds(shownMove.container)).not.toContain('move');
  });

  it('lets no hidden control visit in edit mode, nor once edit mode ends', () => {
    const hidden = new Set(['fog']);
    const withFog = (active: boolean): ResponsiveToolbarItem[] => ITEMS().map((item) => (item.id === 'fog' ? makeItem('fog', { pinned: active }) : item));
    const view = render(<Bar items={withFog(false)} space={null} hiddenIds={hidden} editing />);
    view.rerender(<Bar items={withFog(true)} space={null} hiddenIds={hidden} editing />);
    expect(visibleIds(view.container)).not.toContain('fog');

    view.rerender(<Bar items={withFog(true)} space={null} hiddenIds={hidden} editing={false} />);
    expect(visibleIds(view.container)).not.toContain('fog');
  });

  it('pushes the rightmost control out while a pinned control visits a full bar, and brings it back after', () => {
    const hidden = new Set(['fog']);
    const withFog = (active: boolean): ResponsiveToolbarItem[] => ITEMS().map((item) => (item.id === 'fog' ? makeItem('fog', { pinned: active }) : item));
    // 160px: four controls without the overflow button, or the button and three controls.
    const view = render(<Bar items={withFog(false)} space={160} hiddenIds={hidden} />);
    expect(visibleIds(view.container)).toEqual(['move', 'draw', 'measure', 'palette']);

    view.rerender(<Bar items={withFog(true)} space={160} hiddenIds={hidden} />);
    expect(visibleIds(view.container)).toEqual(['move', 'fog', 'draw']);
    expect(menuLabels()).toEqual(['measure tool', 'palette tool']);

    view.rerender(<Bar items={withFog(false)} space={160} hiddenIds={hidden} />);
    expect(visibleIds(view.container)).toEqual(['move', 'draw', 'measure', 'palette']);
  });
});
