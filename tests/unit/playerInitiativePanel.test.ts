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
    expect(container.textContent).toContain('Mira');
    expect(container.textContent).not.toContain('12');

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

  it('comes in after the fight\'s banner has stood a moment, its cards after it, and leaves as the fight ends, kept until it is gone', async () => {
    const motions: { target: HTMLElement; keyframes: Keyframe[]; timing: KeyframeAnimationOptions; finish: () => void }[] = [];
    HTMLElement.prototype.animate = function (this: HTMLElement, keyframes: Keyframe[], timing: KeyframeAnimationOptions) {
      let finish = (): void => undefined;
      const finished = new Promise<void>((resolve) => { finish = resolve; });
      motions.push({ target: this, keyframes, timing, finish });
      return { finished } as unknown as Animation;
    } as unknown as HTMLElement['animate'];
    const slides = (): typeof motions => motions.filter(({ target }) => target.hasClass('atlas-player-initiative'));
    const made = setup();
    panel = made.panel;
    const container = document.querySelector('.atlas-player-initiative-container')!;

    made.store.getState().startCombat();
    await Promise.resolve();
    expect(slides()).toHaveLength(1);
    // A short way in from the right edge, after the banner's moment
    expect(slides()[0]!.keyframes[0]!.translate).toMatch(/^\d+px 0px$/);
    expect(slides()[0]!.timing.delay).toBeGreaterThan(900);
    // Its cards follow it in
    const cards = motions.filter(({ target }) => target.hasClass('atlas-initiative-card'));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.timing.delay!).toBeGreaterThan(slides()[0]!.timing.delay!);

    // The last turn's flash, as the list drew it
    container.querySelector('.atlas-initiative-card')!.addClass('atlas-initiative-card--turn-flash');

    made.store.getState().endCombat();
    const leaving = container.querySelector('.atlas-player-initiative--leaving');
    expect(leaving).not.toBeNull();
    // Put back into every drawing, it plays it no more
    expect(leaving!.querySelector('.atlas-initiative-card--turn-flash')).toBeNull();
    const exit = slides()[1]!;
    expect(exit.keyframes[1]!.translate).toMatch(/^\d+px 0px$/);
    expect(exit.keyframes[1]!.opacity).toBe(0);
    // A drawing during the slide keeps it
    made.store.getState().setInitiativeTrackerOpen(false);
    expect(container.contains(leaving)).toBe(true);
    exit.finish();
    await Promise.resolve();
    expect(container.childElementCount).toBe(0);
  });
});

describe('the players\' list laid out anew', () => {
  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    document.body.empty();
  });

  it('leaves towards its edge as the lists of the new layout come in from theirs, a moment later', async () => {
    const motions: { target: HTMLElement; keyframes: Keyframe[]; timing: KeyframeAnimationOptions }[] = [];
    HTMLElement.prototype.animate = function (this: HTMLElement, keyframes: Keyframe[], timing: KeyframeAnimationOptions) {
      motions.push({ target: this, keyframes, timing });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined } as unknown as Animation;
    } as unknown as HTMLElement['animate'];
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'player-initiative-swap');
    store.getState().setPersistenceEnabled(false);
    let layout = { fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false };
    const listeners: (() => void)[] = [];
    const settings = {
      getLocalPlayerViewSettings: () => ({ showInitiative: true }),
      onChange: (listener: () => void) => { listeners.push(listener); return () => undefined; },
      initiativeLayout: () => layout,
      initiativeTurnOptions: () => ({ banner: false }),
    } as unknown as SettingsService;
    const panel = new PlayerInitiativePanel(app, settings);
    panel.mount(document.body);
    panel.present(store);
    store.getState().addToInitiative({ partyMemberId: 'mira', name: 'Mira', initiative: 12, initiativeModifier: 0, imagePath: '', isNPC: false });
    store.getState().setInitiativeTrackerOpen(true);
    store.getState().startCombat();
    await Promise.resolve();
    motions.length = 0;

    layout = { fromTurn: true, dock: 'top', edges: ['top', 'bottom'], facesPlayers: true };
    for (const listener of listeners) listener();
    await Promise.resolve();

    const panels = [...document.querySelectorAll<HTMLElement>('.atlas-player-initiative')];
    const old = panels.find((candidate) => candidate.hasClass('atlas-player-initiative--leaving'))!;
    expect(old.dataset.edge).toBe('right');
    const exit = motions.find(({ target }) => target === old)!;
    expect(exit.keyframes[1]!.opacity).toBe(0);
    expect(exit.keyframes[1]!.translate).toMatch(/^\d+px 0px$/);
    const fresh = panels.filter((candidate) => !candidate.hasClass('atlas-player-initiative--leaving'));
    expect(fresh.map((candidate) => candidate.dataset.edge).sort()).toEqual(['bottom', 'top']);
    for (const list of fresh) {
      const enter = motions.find(({ target }) => target === list)!;
      expect(enter.keyframes[0]!.opacity).toBe(0);
      // A moment after the old list began to leave
      expect(enter.timing.delay).toBeGreaterThan(80);
    }
    panel.destroy();
  });
});
