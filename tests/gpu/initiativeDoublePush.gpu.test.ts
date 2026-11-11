import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';
import { playerInitiativeList, renderPlayerInitiative, type EntryToken, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import { TURN_PUSH_MS } from '../../src/app/services/playerInitiativePush';

const VISIBLE: EntryToken = { hp: null, showRing: false, side: 'opponents', defeated: false };

describe('the row moving on past one who sits the round out', () => {
  it('slides the two coming in at the end side by side, as one card comes in alone', () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    document.body.innerHTML = '';
    const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    Object.assign(host.style, { position: 'relative', width: '1400px', height: '600px' });
    const entries: PlayerInitiativeEntry[] = ['a', 'b', 'c', 'd'].map((name, order) => ({ tokenId: name, name, initiative: 20 - order, imagePath: '', order, isActive: name === 'c', ...(name === 'b' ? { sitsOut: true } : {}) }));
    const list = playerInitiativeList({ entries, isActive: true, round: 2 }, () => VISIBLE, { mode: 'turn-order', roll: '1d20', firstSide: 'players' }, false);
    const combatants = list.combatants.slice(0, 2);
    renderPlayerInitiative(host, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: 'bottom', push: { combatants, elapsed: 0, newRound: false } });
    // Halfway through the push
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = TURN_PUSH_MS / 2;
    }
    const cards = [...host.querySelectorAll<HTMLElement>('.atlas-player-initiative__push-in .atlas-player-initiative__card')];
    expect(cards).toHaveLength(2);
    const [first, second] = cards.map((card) => card.getBoundingClientRect());
    // Side by side with the row's gap, not one over the other
    expect(Math.round(second!.left - first!.right)).toBe(8);
    style.remove();
  });
});
