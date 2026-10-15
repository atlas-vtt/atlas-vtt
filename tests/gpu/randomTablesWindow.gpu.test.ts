import '../setup/obsidianDom';
import { cleanup, fireEvent, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { mountTablesWindow, RARITY_SETTINGS, TABLES_THEME, type TablesWindow } from './randomTablesHarness';

const views = vi.hoisted(() => {
  const item = (name: string, type: string, price: string, extra: Record<string, string> = {}): { path: string; name: string; values: Record<string, string> } => ({
    path: `Cairn/Items/${name}.md`, name, values: { 'note.type': type, 'note.price': price, ...extra },
  });
  return {
    Weapons: [item('Longsword', 'Weapon', '20', { 'note.damage': 'd8' }), item('Blunderbuss', 'Weapon', '40', { 'note.damage': 'd12, blast' })],
    Armor: [item('Chainmail', 'Armor', '40', { 'note.armor': '2' })],
    Tools: [item('Rope, 50ft', 'Tool', '5'), item('Lantern', 'Tool', '10', { 'note.description': 'Burns six hours on a flask of oil.' })],
    Magic: [
      item('Potion of Healing', 'Potion', '50', { 'note.rarity': 'Common' }),
      item('Bag of Holding', 'Wondrous item', '500', { 'note.rarity': 'Uncommon' }),
      item('Flame Tongue', 'Weapon', '5000', { 'note.rarity': 'Rare' }),
      item('Staff of Power', 'Staff', '95500', { 'note.rarity': 'Very rare' }),
      item('Vorpal Sword', 'Weapon', '', { 'note.rarity': 'Legendary' }),
      item("Grandmother's Locket", 'Trinket', '', { 'note.rarity': 'Heirloom' }),
    ],
  } as Record<string, { path: string; name: string; values: Record<string, string> }[]>;
});

// The window reaches services that load Node's events module.
vi.mock('events', async () => import('eventemitter3'));
// Obsidian runs base views off screen; here every view answers at once with its Cairn items.
vi.mock('../../src/app/loot/lootQueryView', () => ({
  lootBasesAvailable: (): boolean => true,
  LootBaseQuery: class {
    constructor(_app: unknown, private readonly config: { views: { name: string }[] }, _path: string, private readonly listener: { onSnapshot: (snapshot: unknown) => void }) {}
    start(): Promise<void> {
      const entries = views[this.config.views[0]?.name ?? ''] ?? [];
      const order = ['note.type', 'note.rarity', 'note.price', 'note.damage', 'note.armor', 'note.description'];
      queueMicrotask(() => this.listener.onSnapshot({ entries, order, displayNames: { 'note.damage': 'Damage', 'note.armor': 'Armor' } }));
      return Promise.resolve();
    }
    stop(): void {}
  },
}));

const panel = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-loot-roller')!;
const rect = (element: Element): DOMRect => element.getBoundingClientRect();
const sidebar = (): HTMLElement => panel().querySelector<HTMLElement>('.atlas-loot-roller__sidebar')!;
const select = (name: RegExp): void => { fireEvent.click(within(sidebar()).getByRole('button', { name })); };
const rollButton = (): HTMLButtonElement => panel().querySelector<HTMLButtonElement>('.atlas-loot-roll-button')!;

/** Every element of the window that ends outside it, by its class. */
function overflowing(): string[] {
  const frame = rect(panel());
  return [...panel().querySelectorAll<HTMLElement>('*')]
    .filter((element) => element.getClientRects().length > 0 && !element.closest('.atlas-loot-roller__resize'))
    .filter((element) => {
      const box = rect(element);
      return box.width > 0 && (box.right > frame.right + 0.5 || box.left < frame.left - 0.5);
    })
    .map((element) => element.className.toString());
}

let shown: TablesWindow | null = null;

/** Rolls and waits for the new roll's cards. */
async function rollAndWait(cards: number): Promise<void> {
  const before = shown!.store.getState().lootRoller.lastRoll?.id;
  fireEvent.click(rollButton());
  await expect.poll(() => shown!.store.getState().lootRoller.lastRoll?.id).not.toBe(before);
  await expect.poll(() => panel().querySelectorAll('.atlas-loot-list__cards > li').length).toBe(cards);
}

describe('the Random tables window', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(() => { document.head.append(style); });
  afterEach(() => {
    cleanup();
    style.remove();
    vi.restoreAllMocks();
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`shows the loot base, the master table and text results side by side in ${theme}`, async () => {
      await page.viewport(1280, 860);
      shown = await mountTablesWindow(theme);
      await expect.poll(() => panel()?.querySelector('button.atlas-tables-row') != null).toBe(true);
      expect([...sidebar().querySelectorAll('.atlas-loot-section-label')].map((label) => label.textContent)).toEqual(['Items', 'Text']);
      await page.screenshot({ path: `__screenshots__/random-tables-${theme}-base.png`, element: panel() });

      vi.spyOn(Math, 'random').mockReturnValue(0.7);
      select(/Treasure hoard/);
      await rollAndWait(1);
      await page.screenshot({ path: `__screenshots__/random-tables-${theme}-master.png`, element: panel() });

      select(/Cellar encounters/);
      fireEvent.click(panel().querySelector('.atlas-loot-stepper__button:last-of-type')!);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.2).mockReturnValue(0.5);
      await rollAndWait(2);
      // A table whose numbers leave a gap and name one the die never rolls says so.
      expect([...panel().querySelectorAll('.atlas-tables-chip--problem')].map((chip) => chip.textContent)).toEqual(['1 row the die never rolls', '1 gap']);
      expect(panel().querySelector('.atlas-table-card__rolled')?.textContent).toMatch(/^\d+$/);

      select(/Rumours/);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.4).mockReturnValue(0.9);
      await rollAndWait(2);
      expect(panel().querySelector('.atlas-table-card__field.is-hidden dt')?.firstChild?.textContent).toBe('True?');
      // No repeats is a small switch, no taller than the chips beside it and centred on them, without an icon.
      const toggle = rect(panel().querySelector('.atlas-tables-summary .atlas-toggle')!);
      const chip = rect(panel().querySelector('.atlas-tables-summary .atlas-tables-chip')!);
      const open = rect(panel().querySelector('.atlas-tables-summary__open')!);
      expect(toggle.height).toBeLessThanOrEqual(chip.height);
      expect(Math.abs((toggle.top + toggle.bottom) / 2 - (chip.top + chip.bottom) / 2)).toBeLessThan(1);
      expect(Math.abs((toggle.top + toggle.bottom) / 2 - (open.top + open.bottom) / 2)).toBeLessThan(1);
      expect(panel().querySelector('.atlas-tables-summary .atlas-toggle__icon')).toBeNull();
      await page.screenshot({ path: `__screenshots__/random-tables-${theme}-result.png`, element: panel() });

      fireEvent.click(within(panel()).getByRole('tab', { name: /History/ }));
      await expect.poll(() => panel().querySelectorAll('.atlas-loot-history__roll').length).toBe(3);
      // Text and item cards share the list's columns, at one width.
      const widths = new Set([...panel().querySelectorAll('.atlas-loot-list__cards > li')].map((card) => Math.round(rect(card).width)));
      expect(widths.size).toBe(1);
      await page.screenshot({ path: `__screenshots__/random-tables-${theme}-history.png`, element: panel() });
    });
  }

  it('keeps everything inside the window at its smallest size', async () => {
    await page.viewport(900, 600);
    shown = await mountTablesWindow('dark', { width: 620, height: 420 });
    await expect.poll(() => panel()?.querySelector('button.atlas-tables-row') != null).toBe(true);
    expect(Math.round(rect(panel()).width)).toBe(620);
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    select(/Rumours/);
    await rollAndWait(1);
    expect(overflowing()).toEqual([]);
    const main = panel().querySelector<HTMLElement>('.atlas-loot-roller__main')!;
    expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
    expect(sidebar().scrollWidth).toBeLessThanOrEqual(sidebar().clientWidth);
    // The Roll button and the count stay on one line beside the switch row.
    const actions = panel().querySelector('.atlas-loot-rollbar__actions')!;
    expect(rect(rollButton()).top).toBeCloseTo(rect(actions).top + (rect(actions).height - rect(rollButton()).height) / 2, 0);
    await page.screenshot({ path: '__screenshots__/random-tables-dark-narrow.png', element: panel() });

    select(/Cairn|Items/);
    await expect.poll(() => panel().querySelectorAll('.atlas-loot-rarity, .atlas-loot-tree__check').length).toBeGreaterThan(0);
    expect(overflowing()).toEqual([]);
    await page.screenshot({ path: '__screenshots__/random-tables-dark-narrow-base.png', element: panel() });
  });

  it('runs its cards concentric with the window: the card corner is the window corner less the inset', async () => {
    await page.viewport(1280, 860);
    shown = await mountTablesWindow('light');
    await expect.poll(() => panel()?.querySelector('button.atlas-tables-row') != null).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    select(/Rumours/);
    await rollAndWait(1);
    const card = panel().querySelector<HTMLElement>('.atlas-table-card')!;
    const windowRadius = parseFloat(getComputedStyle(panel()).borderTopLeftRadius);
    const cardRadius = parseFloat(getComputedStyle(card).borderTopLeftRadius);
    expect(windowRadius).toBeGreaterThan(cardRadius);
    expect(cardRadius).toBeGreaterThanOrEqual(8);
    // The rows of the sidebar and the window's search field take the control radius.
    const row = sidebar().querySelector<HTMLElement>('.atlas-tables-row')!;
    expect(getComputedStyle(row).borderTopLeftRadius).toBe(getComputedStyle(sidebar().querySelector('.atlas-tables-search')!).borderTopLeftRadius);
  });

  it('shows a row\'s ⋯ in the fact\'s place, concentric inside the row, and keeps the name clear of it', async () => {
    await page.viewport(1280, 860);
    shown = await mountTablesWindow('dark');
    await expect.poll(() => panel()?.querySelector('button.atlas-tables-row') != null).toBe(true);
    select(/Rumours/);
    const entry = within(sidebar()).getByRole('button', { name: /Rumours/ }).closest<HTMLElement>('.atlas-tables-entry')!;
    const row = entry.querySelector<HTMLElement>('.atlas-tables-row')!;
    const more = entry.querySelector<HTMLElement>('.atlas-tables-entry__more')!;
    await expect.poll(() => getComputedStyle(more).opacity).toBe('1');
    expect(getComputedStyle(entry.querySelector('.atlas-tables-row__fact')!).visibility).toBe('hidden');
    const [r, m] = [rect(row), rect(more)];
    expect(r.right - m.right).toBeCloseTo(4, 0);
    expect((m.top + m.bottom) / 2).toBeCloseTo((r.top + r.bottom) / 2, 0);
    const inset = r.right - m.right;
    expect(parseFloat(getComputedStyle(more).borderTopRightRadius)).toBeCloseTo(parseFloat(getComputedStyle(row).borderTopRightRadius) - inset, 0);
    expect(rect(entry.querySelector('.atlas-tables-row__name')!).right).toBeLessThanOrEqual(m.left + 0.5);

    // The row selected before fades its ⋯ out.
    const others = [...sidebar().querySelectorAll<HTMLElement>('.atlas-tables-entry:not(:has(.is-selected)) .atlas-tables-entry__more')];
    await expect.poll(() => others.every((other) => getComputedStyle(other).opacity === '0')).toBe(true);
    expect(overflowing()).toEqual([]);
    await page.screenshot({ path: '__screenshots__/random-tables-row-menu.png', element: panel() });
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`paints rarities in the collection's words, its own word too, in ${theme}`, async () => {
      await page.viewport(1280, 860);
      shown = await mountTablesWindow(theme, undefined, RARITY_SETTINGS);
      await expect.poll(() => panel()?.querySelectorAll('.atlas-loot-rarity').length).toBe(6);
      const words = [...panel().querySelectorAll('.atlas-loot-rarity')].map((toggle) => [toggle.querySelector('.atlas-loot-rarity__label')?.textContent, toggle.getAttribute('data-rarity')]);
      expect(words).toEqual([['Common', 'common'], ['Uncommon', 'uncommon'], ['Rare', 'rare'], ['Very rare', 'epic'], ['Legendary', 'legendary'], ['Heirloom', 'legendary']]);
      fireEvent.click(panel().querySelector('.atlas-loot-rarity[data-rarity="common"]')!);
      for (let i = 0; i < 4; i++) fireEvent.click(panel().querySelector('.atlas-loot-stepper__button:last-of-type')!);
      let next = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => [0.05, 0.3, 0.5, 0.7, 0.9][next++ % 5]!);
      await rollAndWait(5);
      const tones = [...panel().querySelectorAll('.atlas-loot-list__cards > li')].map((card) => card.getAttribute('data-rarity'));
      expect(tones).toEqual(['uncommon', 'rare', 'epic', 'legendary', 'legendary']);
      await page.screenshot({ path: `__screenshots__/random-tables-${theme}-rarities.png`, element: panel() });
    });
  }
});
