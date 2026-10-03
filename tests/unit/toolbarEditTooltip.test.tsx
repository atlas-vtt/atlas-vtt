import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOLBAR_SCREENSHOTS } from '../../src/app/packages/components/toolbar/toolbarScreenshots';
import { handle, renderToolbar, setUpToolbarTestDom, startEditing, type ToolbarHarness } from './toolbarEditorHarness';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/utils/activeLeafGuard', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/utils/activeLeafGuard')>(),
  isShortcutScopeActive: () => true,
  isActiveAtlasLeaf: () => true,
}));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

setUpToolbarTestDom();

// jsdom lays nothing out: the tray's row stands this far below the top of the window, and the card is this tall.
let rowTop = 600;
const CARD_HEIGHT = 257;
let offsetHeight: PropertyDescriptor | undefined;

beforeEach(() => {
  rowTop = 600;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this.classList.contains('atlas-toolbar-editor__tray-row') ? rowTop : 0;
    return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
  });
  offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('atlas-toolbar-card') ? CARD_HEIGHT : 0;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
});

const card = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('.atlas-toolbar-card');
  if (!element) throw new Error('No card');
  return element;
};

/** Shown: laid out, and faded in. */
const isShown = (): boolean => !card().hidden && card().style.opacity === '1';

// jsdom has no PointerEvent: a mouse event of the pointer's kind.
function pointer(type: string, target: Element, init: MouseEventInit = {}, kind = 'mouse'): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: kind });
  act(() => { target.dispatchEvent(event); });
}

const hover = (target: Element, kind = 'mouse'): void => pointer('pointerover', target, {}, kind);
const leave = (target: Element): void => pointer('pointerout', target, { relatedTarget: document.body });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

function editing(): ToolbarHarness {
  const harness = renderToolbar();
  startEditing(harness);
  return harness;
}

describe('the toolbar editor\'s card', () => {
  it('opens after half a second of hover with the tool\'s name, key, sentence and screenshot', async () => {
    const { container } = editing();
    hover(handle(container, 'fog'));
    await sleep(300);
    expect(card().hidden).toBe(true);
    await waitFor(() => expect(isShown()).toBe(true));
    expect(card().querySelector('.atlas-toolbar-card__label')?.textContent).toBe('Fog of war');
    expect(card().querySelector('kbd')?.textContent).toBe('F');
    expect(card().textContent).toContain('Hide parts of the map from your players');
    expect(card().querySelector('img')?.getAttribute('src')).toBe(TOOLBAR_SCREENSHOTS.fog);
    expect(card().getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the screenshot out where the room above the tray is too low for it', async () => {
    rowTop = CARD_HEIGHT;
    const { container } = editing();
    hover(handle(container, 'fog'));
    await waitFor(() => expect(isShown()).toBe(true));
    expect(card().querySelector('img')).toBeNull();
    expect(card().textContent).toContain('Fog of war');
  });

  it('hides at once on a press, and stays away from the pressed tool until the pointer leaves it', async () => {
    const { container } = editing();
    const fog = handle(container, 'fog');
    hover(fog);
    await waitFor(() => expect(isShown()).toBe(true));
    // The right button: a press that starts no drag.
    pointer('pointerdown', fog, { button: 2 });
    await waitFor(() => expect(card().style.opacity).toBe('0'));
    hover(fog);
    await sleep(700);
    expect(card().style.opacity).toBe('0');
    leave(fog);
    hover(fog);
    await waitFor(() => expect(isShown()).toBe(true));
  });

  it('gives touch no card', async () => {
    const { container } = editing();
    hover(handle(container, 'fog'), 'touch');
    await sleep(700);
    expect(card().hidden).toBe(true);
  });

  it('opens at once for keyboard focus, follows the arrow keys, and lets Escape end edit mode', async () => {
    const { container, store } = editing();
    act(() => handle(container, 'move').focus());
    await waitFor(() => expect(isShown()).toBe(true));
    expect(card().textContent).toContain('Move and select');
    fireEvent.keyDown(handle(container, 'move'), { key: 'ArrowRight' });
    await waitFor(() => expect(card().textContent).toContain('Fog of war'));
    expect(isShown()).toBe(true);
    fireEvent.keyDown(handle(container, 'fog'), { key: 'Escape' });
    await waitFor(() => expect(card().style.opacity).toBe('0'));
    expect(store.getState().isToolbarEditing).toBe(false);
  });

  it('opens no card for the focus edit mode puts on the bar when started from the keyboard', async () => {
    const { container, store } = renderToolbar();
    act(() => store.getState().setCommandPaletteOpen(true));
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'Customize toolbar' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.activeElement).toBe(handle(container, 'move'));
    await sleep(100);
    expect(card().hidden).toBe(true);
  });
});
