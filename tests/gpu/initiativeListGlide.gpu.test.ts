import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import { glideHeight } from '../../src/app/services/playerInitiativeMotion';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const CONDITIONS: ConditionDefinition[] = [{ id: 'prone', name: 'Prone', color: '#e8e0c8' }];

function draw(host: HTMLElement, withCondition: boolean, faces: boolean): HTMLElement {
  host.empty();
  const entries: PlayerInitiativeEntry[] = [0, 1, 2].map((index) => ({ tokenId: `t${index}`, name: `N${index}`, initiative: 20 - index, imagePath: '', isActive: index === 0, order: index }));
  const list = playerInitiativeList({ entries, isActive: true, round: 1 }, (_, index) => entryTokenOf({ id: `t${index}`, kind: 'character', name: `N${index}`, imagePath: '', x: 0, y: 0, ...(withCondition && index === 1 ? { conditions: ['prone'] } : {}) } as never, [], CONDITIONS), { mode: 'turn-order', roll: '1d20', firstSide: 'players' }, false);
  return renderPlayerInitiative(host, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: faces ? 'left' : 'bottom', faces })!;
}

describe('the players\' list growing for a condition', () => {
  it('keeps its cards where they are while its height glides, at the bottom and turned to face a side', () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    for (const faces of [false, true]) {
      document.body.innerHTML = '';
      const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
      Object.assign(host.style, { position: 'relative', width: '1200px', height: '900px' });
      const before = draw(host, false, faces);
      const oldHeight = before.offsetHeight;
      const panel = draw(host, true, faces);
      glideHeight(panel, oldHeight);
      const card = (): DOMRect => panel.querySelector('.atlas-player-initiative__card')!.getBoundingClientRect();
      const start = card();
      panel.getAnimations().forEach((animation) => animation.finish());
      const end = card();
      expect([Math.round(start.x), Math.round(start.y)]).toEqual([Math.round(end.x), Math.round(end.y)]);
    }
  });
});
