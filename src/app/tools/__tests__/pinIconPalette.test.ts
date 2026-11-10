// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createPinIconPalette, type PinIconPalette } from '../pinIconPalette';

let palette: PinIconPalette | null = null;
let container: HTMLElement;

function setup(selected?: string): { onSelect: ReturnType<typeof vi.fn> } {
  const onSelect = vi.fn();
  container = document.body.createDiv();
  palette = createPinIconPalette(container, { selected, onSelect });
  return { onSelect };
}

const slot = (): HTMLButtonElement => container.querySelector<HTMLButtonElement>('.pin-place-slot')!;
const flyout = (): HTMLElement => container.querySelector<HTMLElement>('.pin-place-flyout')!;
const place = (id: string): HTMLButtonElement =>
  flyout().querySelector<HTMLButtonElement>(`[data-icon="${id}"]`)!;
const selectedInRow = (): string | undefined =>
  container.querySelector<HTMLElement>('.pin-icon-row .is-selected')?.dataset.icon;

describe('pin icon palette', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    palette?.destroy();
    palette = null;
    container.remove();
    vi.useRealTimers();
  });

  it('marks the stored icon, resolving legacy ids, without reporting a selection', () => {
    const { onSelect } = setup('scroll');
    expect(selectedInRow()).toBe('note');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the location marker in the slot until a place is chosen', () => {
    setup('pin');
    expect(slot().dataset.icon).toBe('location');
    expect(slot().classList.contains('is-selected')).toBe(false);
  });

  it('shows and selects the stored place in the slot', () => {
    setup('cave');
    expect(slot().dataset.icon).toBe('cave');
    expect(selectedInRow()).toBe('cave');
    expect(place('cave').getAttribute('aria-checked')).toBe('true');
  });

  it('opens the flyout only after the pointer rests on the slot', () => {
    setup();
    slot().dispatchEvent(new Event('pointerenter'));
    expect(flyout().classList.contains('is-open')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(flyout().classList.contains('is-open')).toBe(true);
    expect(slot().getAttribute('aria-expanded')).toBe('true');
  });

  it('stays open while the pointer crosses from the slot to the flyout', () => {
    setup();
    slot().dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(200);
    slot().dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(100);
    flyout().dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(1000);
    expect(flyout().classList.contains('is-open')).toBe(true);

    flyout().dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(300);
    expect(flyout().classList.contains('is-open')).toBe(false);
  });

  it('puts a chosen place in the slot, selects it and closes the flyout', () => {
    const { onSelect } = setup();
    slot().click();
    place('forest').click();

    expect(onSelect).toHaveBeenLastCalledWith('forest');
    expect(slot().dataset.icon).toBe('forest');
    expect(slot().getAttribute('aria-label')).toBe('Forest');
    expect(selectedInRow()).toBe('forest');
    expect(flyout().classList.contains('is-open')).toBe(false);
  });

  it('selects the place the slot shows when it is clicked', () => {
    const { onSelect } = setup('pin');
    slot().click();
    expect(onSelect).toHaveBeenLastCalledWith('location');
    expect(flyout().classList.contains('is-open')).toBe(true);
  });

  it('keeps the chosen place in the slot after another icon is picked', () => {
    const { onSelect } = setup();
    slot().click();
    place('village').click();
    container.querySelector<HTMLButtonElement>('[data-icon="combat"]')!.click();

    expect(onSelect).toHaveBeenLastCalledWith('combat');
    expect(slot().dataset.icon).toBe('village');
    expect(slot().classList.contains('is-selected')).toBe(false);
  });

  it('opens from the keyboard and moves through the places row by row', () => {
    setup('village');
    const press = (from: string, key: string): void => {
      place(from).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };
    slot().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(place('village'));

    // Realm holds fifteen places in rows of eight: down from village (column 5) stays in its column
    press('village', 'ArrowDown');
    expect(document.activeElement).toBe(place('bridge'));
    // and continues into the next group's first row
    press('bridge', 'ArrowDown');
    expect(document.activeElement).toBe(place('waterfall'));
    // Wilderness ends in a row of two: down from the last column lands on that short row's end
    press('waterfall', 'ArrowRight');
    expect(document.activeElement).toBe(place('swamp'));
    place('oasis').focus();
    press('oasis', 'ArrowDown');
    expect(document.activeElement).toBe(place('volcano'));

    press('volcano', 'Escape');
    expect(flyout().classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(slot());
  });
});
