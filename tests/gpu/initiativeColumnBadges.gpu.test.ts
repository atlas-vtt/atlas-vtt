import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const CONDITIONS: ConditionDefinition[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, color: '#c03030' }));

/** An upright list whose combatants carry `counts` conditions each, each lasting a number of turns; the turn is `active`'s. */
function draw(dock: PlayersListEdge, active: number, counts: readonly number[]): HTMLElement {
  document.body.innerHTML = '';
  const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  Object.assign(host.style, { position: 'relative', width: '1600px', height: '900px' });
  const entries: PlayerInitiativeEntry[] = counts.map((_, index) => ({ tokenId: `t${index}`, name: `N${index}`, initiative: 30 - index, imagePath: '', isActive: index === active, order: index }));
  const list = playerInitiativeList({ entries, isActive: true, round: 1 }, (_, index) => ({
    ...entryTokenOf({ id: `t${index}`, kind: 'character', name: `N${index}`, imagePath: '', x: 0, y: 0, conditions: CONDITIONS.slice(0, counts[index]).map((c) => c.id) } as never, [], CONDITIONS),
  }), { mode: 'turn-order', roll: '1d20', firstSide: 'players' }, false);
  for (const combatant of list.combatants) combatant.token.conditions = combatant.token.conditions?.map((condition) => ({ ...condition, turns: 2 }));
  return renderPlayerInitiative(host, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock, faces: false })!;
}

/** The badges of every card the list shows at least half of lie inside the list's clip, their rings and counts of turns included. */
function expectBadgesInside(panel: HTMLElement): void {
  const clip = panel.querySelector<HTMLElement>('.atlas-player-initiative__list')!.getBoundingClientRect();
  let checked = 0;
  for (const card of panel.querySelectorAll<HTMLElement>('.atlas-player-initiative__card--conditions')) {
    const shown = card.getBoundingClientRect();
    if ((shown.top + shown.bottom) / 2 > clip.bottom) continue;
    const parts = [...card.querySelectorAll<HTMLElement>('.atlas-player-initiative__condition, .atlas-player-initiative__condition-turns, .atlas-player-initiative__condition-more')]
      .map((part) => part.getBoundingClientRect());
    // The ring around each badge is 2 px
    expect(Math.min(...parts.map((part) => part.top)) - 2).toBeGreaterThanOrEqual(clip.top - 0.5);
    expect(Math.min(...parts.map((part) => part.left)) - 2).toBeGreaterThanOrEqual(clip.left - 0.5);
    expect(Math.max(...parts.map((part) => part.right)) + 2).toBeLessThanOrEqual(clip.right + 0.5);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}

describe('condition badges on an upright list', () => {
  it('stay inside a column at either side, four of them with their turns as well', () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    expectBadgesInside(draw('left', 0, [1, 2, 0, 0]));
    expectBadgesInside(draw('right', 1, [0, 3, 4, 5]));
  });

  it('stay in view over the turn\'s card when a long column scrolls it to its top', () => {
    const panel = draw('left', 6, [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1]);
    expectBadgesInside(panel);
  });
});
