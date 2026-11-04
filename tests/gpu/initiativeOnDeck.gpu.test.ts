import '../setup/obsidianDom';
import '../../styles/main.scss';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';

const PORTRAIT = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="teal"/></svg>');
const SLACK = 0.5;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  Object.assign(host.style, {
    position: 'relative', width: '500px', height: '950px',
  });
  host.style.setProperty('--font-interface', 'sans-serif');
  host.style.setProperty('--font-ui-small', '13px');
  host.style.setProperty('--font-ui-smaller', '12px');
});

afterEach(() => host.remove());

function draw(active: number, hidden: number[] = []): { list: HTMLElement; cards: HTMLElement[]; current: HTMLElement | null } {
  host.empty();
  const entries: PlayerInitiativeEntry[] = Array.from({ length: 12 }, (_, index) => ({
    tokenId: `token-${index}`, name: `Combatant ${index}`, initiative: 20 - index,
    imagePath: PORTRAIT, order: index, isActive: index === active,
  }));
  const list = playerInitiativeList(
    { entries, isActive: true, round: 1 },
    (_, index) => hidden.includes(index) ? null : { hp: null, showRing: false, side: 'opponents' },
    { mode: 'turn-order', roll: '1d20', firstSide: 'players' },
    false,
  );
  renderPlayerInitiative(host, list, { showNames: true, portraitSrc: (src) => src });
  return {
    list: host.querySelector<HTMLElement>('.atlas-player-initiative__list')!,
    cards: [...host.querySelectorAll<HTMLElement>('.atlas-player-initiative__card')],
    current: host.querySelector<HTMLElement>('.atlas-player-initiative__card--active'),
  };
}

function expectVisible(list: HTMLElement, card: HTMLElement): void {
  const viewport = list.getBoundingClientRect();
  const bounds = card.getBoundingClientRect();
  expect(bounds.top).toBeGreaterThanOrEqual(viewport.top - SLACK);
  expect(bounds.bottom).toBeLessThanOrEqual(viewport.bottom + SLACK);
}

describe('the player initiative list shows who is on deck', () => {
  it('shows the current and next two combatants with real card sizes and scrolling', () => {
    const { list, cards, current } = draw(6);
    expect(list.scrollTop).toBeGreaterThan(0);
    for (const card of [current!, cards[7]!, cards[8]!]) expectVisible(list, card);
  });

  it('keeps the current card visible when the panel is too small for all three', () => {
    host.style.height = '600px';
    const { list, cards, current } = draw(6);
    expectVisible(list, current!);
    expect(current!.getBoundingClientRect().top).toBeCloseTo(list.getBoundingClientRect().top, 0);
    expect(cards[8]!.getBoundingClientRect().bottom).toBeGreaterThan(list.getBoundingClientRect().bottom);
  });

  it('counts the next visible combatants, leaving hidden opponents out of the list', () => {
    const { list, cards, current } = draw(5, [6, 7]);
    expect(list.textContent).not.toContain('Combatant 6');
    expect(list.textContent).not.toContain('Combatant 7');
    expect(cards[6]!.textContent).toContain('Combatant 8');
    expect(cards[7]!.textContent).toContain('Combatant 9');
    for (const card of [current!, cards[6]!, cards[7]!]) expectVisible(list, card);
  });

  it('does not reveal or scroll to an opponent whose active turn is hidden', () => {
    const { list, current } = draw(6, [6]);
    expect(current).toBeNull();
    expect(list.textContent).not.toContain('Combatant 6');
    expect(list.scrollTop).toBe(0);
  });

  it('handles the last turn and the return to the first turn without changing the order', () => {
    const last = draw(11);
    expectVisible(last.list, last.current!);
    const first = draw(0);
    for (const card of first.cards.slice(0, 3)) expectVisible(first.list, card);
    expect(first.list.scrollTop).toBe(0);
    expect(first.cards.map((card) => card.querySelector('.atlas-player-initiative__name')?.textContent))
      .toEqual(Array.from({ length: 12 }, (_, index) => `Combatant ${index}`));
  });
});
