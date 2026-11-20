// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerInitiativePanel } from '../../src/app/services/PlayerInitiativePanel';
import type { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function setup(): { store: ReturnType<typeof createViewAtlasStore>; panel: PlayerInitiativePanel } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'player-initiative-panel');
  store.getState().setPersistenceEnabled(false);
  const settings = {
    getLocalPlayerViewSettings: () => ({ showInitiative: true }),
    onChange: () => () => undefined,
    initiativeLayout: () => ({ fromTurn: false, dock: 'right', edges: ['right'], facesPlayers: false }),
    initiativeTurnOptions: () => ({ banner: true }),
  } as unknown as SettingsService;
  const panel = new PlayerInitiativePanel(app, settings);
  panel.mount(document.body);
  panel.present(store);
  store.getState().addToInitiative({ partyMemberId: 'mira', name: 'Mira', initiative: 12, initiativeModifier: 0, imagePath: '', isNPC: false });
  store.getState().setInitiativeTrackerOpen(true);
  return { store, panel };
}

describe('the players\' initiative list', () => {
  let panel: PlayerInitiativePanel | undefined;

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    panel?.destroy();
    document.body.empty();
  });

  it('shows only while a fight runs, though the GM\'s tracker is open and lists combatants before and after', async () => {
    const made = setup();
    panel = made.panel;
    const container = document.querySelector('.atlas-player-initiative-container')!;
    expect(container.childElementCount).toBe(0);

    made.store.getState().startCombat();
    expect(container.childElementCount).toBeGreaterThan(0);
    expect(container.textContent).toContain('12');

    made.store.getState().endCombat();
    // It slides out first
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.childElementCount).toBe(0);
  });

  it('stays away during a fight while the GM\'s tracker is closed', async () => {
    const made = setup();
    panel = made.panel;
    made.store.getState().startCombat();
    made.store.getState().setInitiativeTrackerOpen(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.atlas-player-initiative-container')!.childElementCount).toBe(0);
  });

  it('slides in after the fight\'s banner has stood a moment, and out again as the fight ends, kept until it is gone', async () => {
    const slides: { keyframes: Keyframe[]; timing: KeyframeAnimationOptions; finish: () => void }[] = [];
    HTMLElement.prototype.animate = function (keyframes: Keyframe[], timing: KeyframeAnimationOptions) {
      let finish = (): void => undefined;
      const finished = new Promise<void>((resolve) => { finish = resolve; });
      slides.push({ keyframes, timing, finish });
      return { finished } as unknown as Animation;
    } as unknown as HTMLElement['animate'];
    const made = setup();
    panel = made.panel;
    const container = document.querySelector('.atlas-player-initiative-container')!;

    made.store.getState().startCombat();
    await Promise.resolve();
    expect(slides).toHaveLength(1);
    expect(slides[0]!.keyframes[0]!.translate).toMatch(/^\d+px 0px$/);
    expect(slides[0]!.timing.delay).toBeGreaterThan(900);

    // The last turn's push and flash, as the list drew them
    const card = container.querySelector('.atlas-player-initiative__card')!;
    card.addClass('atlas-player-initiative__push-in', 'atlas-player-initiative__card--turn-flash');
    card.parentElement!.createDiv({ cls: 'atlas-player-initiative__leaving' });

    made.store.getState().endCombat();
    const leaving = container.querySelector('.atlas-player-initiative--leaving');
    expect(leaving).not.toBeNull();
    // Put back into every drawing, it plays them no more
    expect(leaving!.querySelector('.atlas-player-initiative__leaving, .atlas-player-initiative__push-in, .atlas-player-initiative__card--turn-flash')).toBeNull();
    expect(slides[1]!.keyframes[1]!.translate).toMatch(/^\d+px 0px$/);
    // A drawing during the slide keeps it
    made.store.getState().setInitiativeTrackerOpen(false);
    expect(container.contains(leaving)).toBe(true);
    slides[1]!.finish();
    await Promise.resolve();
    expect(container.childElementCount).toBe(0);
  });
});
