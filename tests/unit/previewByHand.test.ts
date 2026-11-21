// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewEntry, watchPressOutside } from '../../src/app/services/previewByHand';
import { initiativeCardMenu, type CardMenuActions, type CardMenuMode } from '../../src/app/react/components/initiativeCardMenu';
import { nextOptionState } from '../../src/app/packages/components/asset-manager/components/search/OptionChips';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';

afterEach(() => document.body.replaceChildren());

const labels = (entries: readonly ContextMenuEntry[]): string[] => entries.flatMap((entry) => (entry.type === 'item' || entry.type === 'submenu' ? [entry.label] : []));

describe('a preview opened from a menu', () => {
  it('is a row named Preview that runs what it is given', () => {
    const open = vi.fn();
    const entry = previewEntry(open);
    expect(entry).toMatchObject({ type: 'item', label: 'Preview' });
    if (entry.type === 'item') entry.onClick?.();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('closes at the first press outside it, never at one inside, and once', () => {
    const inside = document.body.appendChild(document.createElement('div'));
    const outside = document.body.appendChild(document.createElement('div'));
    const closed = vi.fn();
    watchPressOutside(document, (target) => inside.contains(target), closed);
    inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closed).not.toHaveBeenCalled();
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes at Escape, and hears nothing once stopped', () => {
    const closed = vi.fn();
    watchPressOutside(document, () => false, closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(closed).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalledTimes(1);
    const stop = watchPressOutside(document, () => false, closed);
    stop();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('the Preview row of an initiative card', () => {
  const entry = { id: 'e1', tokenId: 't1', name: 'Goblin', order: 0 } as InitiativeEntry;
  const mode: CardMenuMode = { bySides: false, sides: [], cards: false, fightRuns: false, swapTargets: [] };
  const actions = (preview?: () => void): CardMenuActions => ({
    roll: vi.fn(), moveToFront: vi.fn(), moveToBack: vi.fn(), edit: vi.fn(), updateToken: vi.fn(), setSitsOut: vi.fn(),
    swapCard: vi.fn(), delay: vi.fn(), actNow: vi.fn(), placeOnMap: vi.fn(), remove: vi.fn(), preview,
  });

  it('is there for a combatant with a statblock to show, and runs the preview', () => {
    const preview = vi.fn();
    const menu = initiativeCardMenu(entry, undefined, mode, actions(preview));
    expect(labels(menu)).toContain('Preview');
    const row = menu.find((each) => each.type === 'item' && each.label === 'Preview');
    if (row?.type === 'item') row.onClick?.();
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('is left out where there is none', () => {
    expect(labels(initiativeCardMenu(entry, undefined, mode, actions()))).not.toContain('Preview');
  });
});

describe('a filter option under the pointer in use', () => {
  it('is required or cleared by a click, and excluded with Alt', () => {
    expect(nextOptionState(null, false, false)).toBe('include');
    expect(nextOptionState('include', false, false)).toBeNull();
    expect(nextOptionState('exclude', false, false)).toBeNull();
    expect(nextOptionState('include', true, false)).toBe('exclude');
    expect(nextOptionState('exclude', true, false)).toBeNull();
  });

  it('goes round required, excluded and cleared under a finger', () => {
    expect(nextOptionState(null, false, true)).toBe('include');
    expect(nextOptionState('include', false, true)).toBe('exclude');
    expect(nextOptionState('exclude', false, true)).toBeNull();
  });
});
