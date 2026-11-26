// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { TurnBannerStage } from '../../src/app/initiative/banner/turnBannerStage';
import { fightBanner } from '../../src/app/initiative/banner/fightWatch';

function listAt(edge: string): void {
  const list = document.body.createDiv({ cls: 'atlas-player-initiative' });
  list.dataset.edge = edge;
}

describe('TurnBannerStage', () => {
  afterEach(() => {
    document.body.empty();
  });

  it('says a fight began in the middle of the table where the list is a column', () => {
    const stage = new TurnBannerStage(() => null);
    stage.mount(document.body);
    listAt('right');
    stage.show([fightBanner('started')], { fight: 'start', atLists: false, facesPlayers: false });
    expect(document.querySelectorAll('.atlas-player-turn-banner__anchor')).toHaveLength(0);
    expect(stage.showing).toBe(true);
    stage.destroy();
  });

  it('says it at a list that is a row, as the row slides in', () => {
    const stage = new TurnBannerStage(() => null);
    stage.mount(document.body);
    listAt('bottom');
    listAt('left');
    stage.show([fightBanner('started')], { fight: 'start', atLists: false, facesPlayers: false });
    expect(document.querySelectorAll('.atlas-player-turn-banner__anchor')).toHaveLength(1);
    stage.destroy();
  });
});
