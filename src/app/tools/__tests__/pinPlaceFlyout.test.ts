// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PIN_ICON_GROUPS, PIN_ICON_PATHS, type PinIconId } from '../../types/pinIcons';
import { createPinPlaceFlyout, type PinPlaceFlyout } from '../pinPlaceFlyout';

let made: PinPlaceFlyout | null = null;
let container: HTMLElement;
let anchor: HTMLButtonElement;

/** The flyout as the Draw tool's Symbol button opens it: every icon, a search, no tones, opened by its owner. */
function setup(selected: PinIconId | null = null): { onSelect: ReturnType<typeof vi.fn<(id: PinIconId) => void>>; onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>> } {
  const onSelect = vi.fn<(id: PinIconId) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  container = document.body.createDiv();
  anchor = document.body.createEl('button');
  made = createPinPlaceFlyout(container, {
    anchor, selected, onSelect, onOpenChange, groups: PIN_ICON_GROUPS, label: 'Symbol', tones: false, hover: false,
    search: { label: 'Search symbols', empty: 'No symbol with that name' },
  });
  return { onSelect, onOpenChange };
}

const flyout = (): HTMLElement => container.querySelector<HTMLElement>('.pin-place-flyout')!;
const isOpen = (): boolean => flyout().classList.contains('is-open');
const search = (): HTMLInputElement => flyout().querySelector<HTMLInputElement>('.pin-place-search')!;
const buttons = (): HTMLButtonElement[] => [...flyout().querySelectorAll<HTMLButtonElement>('.pin-icon-btn')];
const shown = (): string[] => buttons().filter((button) => !button.hidden).map((button) => button.dataset.icon!);
const icon = (id: string): HTMLButtonElement => flyout().querySelector<HTMLButtonElement>(`[data-icon="${id}"]`)!;
const type = (words: string): void => {
  search().value = words;
  search().dispatchEvent(new Event('input', { bubbles: true }));
};
const key = (target: HTMLElement, name: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  made?.destroy();
  made = null;
  container.remove();
  anchor.remove();
});

describe('the icon flyout with every icon and a search', () => {
  it('offers every pin icon in its groups, under the name it was given, without the pins\' tones', () => {
    setup('cauldron');
    expect(flyout().getAttribute('aria-label')).toBe('Symbol');
    expect(shown().sort()).toEqual(Object.keys(PIN_ICON_PATHS).sort());
    expect([...flyout().querySelectorAll('.pin-place-group-name')].map((heading) => heading.textContent)).toEqual(PIN_ICON_GROUPS.map((group) => group.name));
    for (const button of buttons()) expect(button.style.getPropertyValue('--pin-color-light')).toBe('');
    expect(icon('cauldron').getAttribute('aria-checked')).toBe('true');
    expect(flyout().querySelector('.pin-place-caption-name')!.textContent).toBe('Cauldron');
  });

  it('opens and closes by its owner alone, and not while the pointer rests on its anchor', () => {
    vi.useFakeTimers();
    const { onOpenChange } = setup();
    anchor.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(1000);
    expect(isOpen()).toBe(false);
    made!.toggle();
    expect(isOpen()).toBe(true);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(search());
    // The pointer leaving it closes nothing.
    flyout().dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(1000);
    expect(isOpen()).toBe(true);
    made!.toggle();
    expect(isOpen()).toBe(false);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
    vi.useRealTimers();
  });

  it('closes on a press outside it, and leaves a press on its anchor to the anchor', () => {
    setup();
    made!.toggle();
    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(true);
    icon('forest').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('leaves the icons whose name holds what is typed, hides a group with none, and says so where no icon is left', () => {
    setup();
    made!.toggle();
    type('  DOOR ');
    expect(shown()).toEqual(['secret-door', 'door', 'trapdoor']);
    const groups = [...flyout().querySelectorAll<HTMLElement>('.pin-place-group')];
    expect(groups.filter((group) => !group.hidden)).toHaveLength(1);
    const empty = flyout().querySelector<HTMLElement>('.pin-place-empty')!;
    expect(empty.hidden).toBe(true);
    type('zzz');
    expect(shown()).toEqual([]);
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No symbol with that name');
    type('');
    expect(shown()).toHaveLength(Object.keys(PIN_ICON_PATHS).length);
    expect(groups.every((group) => !group.hidden)).toBe(true);
  });

  it('picks the first icon left with Enter, and shows every icon again when it next opens', () => {
    const { onSelect } = setup();
    made!.toggle();
    type('cau');
    key(search(), 'Enter');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('cauldron');
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
    made!.toggle();
    expect(search().value).toBe('');
    expect(shown()).toHaveLength(Object.keys(PIN_ICON_PATHS).length);
  });

  it('empties the search with Escape, then closes; its keys are no one else\'s', () => {
    setup();
    made!.toggle();
    const heard = vi.fn();
    document.body.addEventListener('keydown', heard);
    type('tower');
    key(search(), 'b');
    key(search(), 'Escape');
    expect(search().value).toBe('');
    expect(isOpen()).toBe(true);
    key(search(), 'Escape');
    expect(isOpen()).toBe(false);
    expect(heard).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', heard);
  });

  it('moves with the arrow keys among the icons the search left, from the field and back to it', () => {
    setup();
    made!.toggle();
    type('or');
    const left = shown();
    expect(left.length).toBeGreaterThan(3);
    key(search(), 'ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.icon).toBe(left[0]);
    key(document.activeElement as HTMLElement, 'ArrowRight');
    expect((document.activeElement as HTMLElement).dataset.icon).toBe(left[1]);
    key(document.activeElement as HTMLElement, 'ArrowLeft');
    key(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(search());
    // A name typed on an icon goes to the search.
    key(search(), 'ArrowDown');
    key(document.activeElement as HTMLElement, 't');
    expect(document.activeElement).toBe(search());
  });

  it('picks by a click, marks the pick, and lets go of the page when it is destroyed while open', () => {
    const { onSelect } = setup();
    made!.toggle();
    icon('skull' in PIN_ICON_PATHS ? 'skull' : 'boss').click();
    expect(onSelect).toHaveBeenCalledWith('boss');
    made!.setSelected('boss');
    expect(icon('boss').classList.contains('is-selected')).toBe(true);
    made!.toggle();
    made!.destroy();
    made = null;
    expect(container.querySelector('.pin-place-flyout')).toBeNull();
  });
});
