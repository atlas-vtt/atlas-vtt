import { describe, expect, it } from 'vitest';
import { cardKeyAction, columnsOfRow, nextGridIndex, type GridKey } from '../../src/app/packages/components/asset-manager/utils/gridNavigation';
import { nextMenuItem } from '../../src/app/packages/components/asset-manager/hooks/useMenuKeys';
import { tabStopsFrom } from '../../src/app/packages/components/primitives/tabStops';

const key = (name: string, mods: Partial<GridKey> = {}): GridKey => ({
  key: name, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods,
});

describe('nextGridIndex: focus in a grid of 10 cards, 4 to a row', () => {
  const at = (index: number, name: string, pageRows = 1): number | null => nextGridIndex(index, key(name), 4, 10, pageRows);

  it('steps to the neighbours and stops at the ends', () => {
    expect(at(5, 'ArrowRight')).toBe(6);
    expect(at(5, 'ArrowLeft')).toBe(4);
    expect(at(9, 'ArrowRight')).toBe(9);
    expect(at(0, 'ArrowLeft')).toBe(0);
  });

  it('moves a row up and down, staying in the first and last row', () => {
    expect(at(5, 'ArrowDown')).toBe(9);
    expect(at(5, 'ArrowUp')).toBe(1);
    expect(at(1, 'ArrowUp')).toBe(1);
    expect(at(9, 'ArrowDown')).toBe(9);
  });

  it('lands on the last card from a row above a shorter last row, as Finder does', () => {
    expect(at(7, 'ArrowDown')).toBe(9);
  });

  it('goes to the ends with Home and End and a page with Page Up and Down', () => {
    expect(at(6, 'Home')).toBe(0);
    expect(at(2, 'End')).toBe(9);
    expect(at(1, 'PageDown', 2)).toBe(9);
    expect(at(9, 'PageUp', 5)).toBe(1);
  });

  it('leaves other keys, Alt and an empty grid alone', () => {
    expect(at(3, 'Enter')).toBeNull();
    expect(nextGridIndex(3, key('ArrowRight', { altKey: true }), 4, 10)).toBeNull();
    expect(nextGridIndex(0, key('ArrowRight'), 4, 0)).toBeNull();
  });
});

describe('cardKeyAction', () => {
  it('maps the card keys to their actions (decision #2)', () => {
    expect(cardKeyAction(key('Enter'))).toBe('open');
    expect(cardKeyAction(key(' '))).toBe('select');
    expect(cardKeyAction(key(' ', { shiftKey: true }))).toBe('select');
    expect(cardKeyAction(key('Delete'))).toBe('delete');
    expect(cardKeyAction(key('Backspace', { metaKey: true }))).toBe('delete');
    expect(cardKeyAction(key('F10', { shiftKey: true }))).toBe('menu');
  });

  it('leaves the keys others use', () => {
    expect(cardKeyAction(key('Enter', { metaKey: true }))).toBeNull();
    expect(cardKeyAction(key('F10'))).toBeNull();
    expect(cardKeyAction(key('a'))).toBeNull();
    expect(cardKeyAction(key('ArrowDown'))).toBeNull();
  });
});

it('reads the column count of a wrapping row from where its first row ends', () => {
  const items = [0, 0, 0, 40, 40].map((top) => ({ offsetTop: top }) as HTMLElement);
  expect(columnsOfRow(items)).toBe(3);
  expect(columnsOfRow(items.slice(0, 2))).toBe(2);
  expect(columnsOfRow([])).toBe(1);
});

it('wraps a menu\'s arrow keys at its ends', () => {
  expect(nextMenuItem('ArrowDown', 2, 3)).toBe(0);
  expect(nextMenuItem('ArrowUp', 0, 3)).toBe(2);
  expect(nextMenuItem('ArrowUp', -1, 3)).toBe(2);
  expect(nextMenuItem('End', 0, 3)).toBe(2);
  expect(nextMenuItem('Enter', 0, 3)).toBeNull();
});

it('orders the tab stops from the focused one, wrapping either way', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => ({ id }) as HTMLElement);
  const stops = [a!, b!, c!];
  expect(tabStopsFrom(stops, c!, false).map((stop) => stop.id)).toEqual(['a', 'b']);
  expect(tabStopsFrom(stops, a!, true).map((stop) => stop.id)).toEqual(['c', 'b']);
  expect(tabStopsFrom(stops, null, false)[0]?.id).toBe('a');
  expect(tabStopsFrom(stops, null, true)[0]?.id).toBe('c');
});
