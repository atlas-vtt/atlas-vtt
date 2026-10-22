import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { KNOCK_ROOM, knockCards, renderCards, restCards, stackCards } from '../../src/app/online/gm/dock/knockStack';
import { DASHBOARD_THEME as THEME } from './dashboardTheme';

vi.mock('events', async () => import('eventemitter3'));

/** A player's rest request among the cards over the online control, laid out by the plugin's stylesheet. */

const KNOCK = { id: 'm'.repeat(20), name: 'Mira', answered: false, full: false, armed: true };
const REST = { key: `rest:${'c'.repeat(24)}`, character: 'Brannoch the Unbowed of the Northern Reaches', button: 'Long rest', picks: [], rules: ['Hit Points to full', '2 Hit Dice', 'Exhaustion −1', 'Spell slots to full'], armed: true, answered: false };

/** The control at the bottom of a map, with its stack of cards over it, as `KnockStack` lays them out. */
function stack(): { dock: HTMLElement; cards: HTMLElement } {
  document.body.className = 'theme-dark';
  const plugin = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  plugin.style.cssText = 'position: absolute; inset: 0; background: var(--background-primary);';
  const dock = plugin.createDiv({ cls: 'atlas-online-dock' });
  dock.style.cssText = 'left: 40px; bottom: 40px;';
  const cards = dock.createDiv({ cls: 'atlas-online-knocks' });
  cards.style.width = '300px';
  const all = stackCards([...knockCards([KNOCK], { admit: vi.fn(), decline: vi.fn() }), ...restCards([REST], { approve: vi.fn(), decline: vi.fn() })], []);
  renderCards(cards, all, dock);
  dock.style.setProperty('--atlas-online-knocks-height', `${cards.offsetHeight}px`);
  return { dock, cards };
}

describe('a rest request\'s card', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => {
    style.remove();
    document.body.empty();
  });

  it('is one line as tall as a newcomer\'s, within the room the control keeps for a card, its answers in place', async () => {
    const { cards } = stack();
    const [knock, rest] = [...cards.querySelectorAll<HTMLElement>('.atlas-online-knock')].map((card) => card.getBoundingClientRect());
    expect(rest!.height).toBe(knock!.height);
    expect(rest!.height).toBeLessThan(KNOCK_ROOM);
    const buttons = [...cards.querySelectorAll<HTMLElement>('.atlas-online-knock')].map((card) => [...card.querySelectorAll('button')].map((button) => button.getBoundingClientRect().right));
    // A long name gives way: the answers end where the newcomer's end.
    expect(buttons[1]?.at(-1)).toBe(buttons[0]?.at(-1));
    await page.screenshot({ path: '__screenshots__/atlas-online-rest-card.png', element: cards });
  });

  it('shows what the rest will do above the cards on keyboard focus, covering none', async () => {
    const { dock, cards } = stack();
    const line = cards.querySelectorAll<HTMLElement>('.atlas-online-knock__text')[1];
    line?.focus();
    const tooltip = dock.querySelector<HTMLElement>('.atlas-online-tooltip--cards');
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toBe('Hit Points to full · 2 Hit Dice · Exhaustion −1 · Spell slots to full');
    expect(tooltip!.getBoundingClientRect().bottom).toBeLessThanOrEqual(cards.getBoundingClientRect().top);
    await page.screenshot({ path: '__screenshots__/atlas-online-rest-card-rules.png', element: document.body });
  });
});
