// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { typeToSearch } from '../../src/app/packages/components/asset-manager/components/search/typeToSearch';

// The window as the asset manager draws it: the toolbar with its search, a card in the grid, a menu and a field of its own.
let root: HTMLDivElement;
const toolbar = (): HTMLElement => root.querySelector<HTMLElement>('.atlas-am-toolbar')!;
const search = (): HTMLInputElement => root.querySelector<HTMLInputElement>('.atlas-asset-manager-search input')!;
const card = (): HTMLElement => root.querySelector<HTMLElement>('[role="option"]')!;

function press(target: Element, init: KeyboardEventInit, setSearch = vi.fn()): { event: KeyboardEvent; setSearch: typeof setSearch; took: boolean } {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  let took = false;
  const listener = (e: KeyboardEvent): void => { took = typeToSearch(e, root, setSearch); };
  document.addEventListener('keydown', listener);
  target.dispatchEvent(event);
  document.removeEventListener('keydown', listener);
  return { event, setSearch, took };
}

beforeEach(() => {
  root = document.body.createDiv({ cls: 'atlas-asset-manager-modal', attr: { tabindex: '-1' } });
  root.innerHTML = `
    <div class="atlas-am-toolbar" data-compact="tabs search">
      <div class="atlas-am-search"><button class="atlas-am-search-toggle">Search</button>
        <div class="atlas-asset-manager-search"><input type="text" value="old"></div></div>
    </div>
    <div role="listbox"><div role="option" tabindex="0">Goblin</div></div>
    <div role="menu"><div role="menuitem" tabindex="-1">Rename</div></div>
    <input class="other-field" type="text">`;
});
afterEach(() => root.remove());

describe('type-to-search where the search is folded into a button (#42)', () => {
  it('opens the field with the character typed on the window or a card, in place of the query', () => {
    root.focus();
    const onWindow = press(root, { key: 'g' });
    expect(onWindow.took).toBe(true);
    expect(onWindow.event.defaultPrevented).toBe(true);
    expect(onWindow.setSearch).toHaveBeenCalledWith('g');
    expect(document.activeElement).toBe(search());

    card().focus();
    expect(press(card(), { key: 'W', shiftKey: true }).setSearch).toHaveBeenCalledWith('W');
  });

  it('leaves the tabs and the key alone while the search stands in the row', () => {
    toolbar().dataset.compact = 'tabs';
    const { took, event, setSearch } = press(root, { key: 'g' });
    expect([took, event.defaultPrevented]).toEqual([false, false]);
    expect(setSearch).not.toHaveBeenCalled();
  });

  it.each([
    ['a shortcut with Cmd', { key: 'f', metaKey: true }],
    ['a shortcut with Ctrl', { key: 'f', ctrlKey: true }],
    ['a character with Alt', { key: 'ø', altKey: true }],
    ['Space, which presses the focused control', { key: ' ' }],
    ['a key that types nothing', { key: 'Enter' }],
    ['a key the input method is composing', { key: 'a', isComposing: true }],
  ])('takes no %s', (_name, init) => {
    expect(press(root, init).took).toBe(false);
  });

  it('takes no key a control already used, nor one typed into a field or a menu', () => {
    const used = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true });
    used.preventDefault();
    expect(typeToSearch(used, root, vi.fn())).toBe(false);
    expect(press(root.querySelector('.other-field')!, { key: 'g' }).took).toBe(false);
    expect(press(root.querySelector('[role="menuitem"]')!, { key: 'r' }).took).toBe(false);
  });

  it('takes no key pressed outside the window', () => {
    const outside = document.body.createDiv();
    expect(press(outside, { key: 'g' }).took).toBe(false);
    outside.remove();
  });
});
