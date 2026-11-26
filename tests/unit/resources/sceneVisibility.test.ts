import { describe, expect, it } from 'vitest';
import { barWidgets, hiddenOnNewScenes, newSceneTokenSettings, toggleHidden, withChangedBars } from '../../../src/app/resources/sceneVisibility';
import { AMMO, HP, STRESS } from '../../mocks/resourceFixtures';
import { DEFAULT_TOKEN_SETTINGS } from '../../../src/app/types/viewState';
import { sceneAdoption } from '../../../src/app/services/assetTransfer/sceneAdoption';

describe('scene visibility of resources', () => {
  it('switches one resource without touching the others', () => {
    expect(toggleHidden(['stress'], 'hp')).toEqual(['stress', 'hp']);
    expect(toggleHidden(['stress', 'hp'], 'stress')).toEqual(['hp']);
    expect(toggleHidden(undefined, 'hp')).toEqual(['hp']);
  });

  it('starts a new scene with the bars the collection\'s default widgets switch on, as it always did', () => {
    expect(hiddenOnNewScenes({ hpBar: true, stressBar: true })).toEqual([]);
    expect(hiddenOnNewScenes({ hpBar: true })).toEqual(['stress']);
    expect(hiddenOnNewScenes({ hpBar: false, stressBar: false })).toEqual(['hp', 'stress']);
    expect(hiddenOnNewScenes({ initiativeTracker: true })).toEqual(['hp', 'stress']);
    // A collection that never set its default widgets: HP on, the secondary bar off
    expect(hiddenOnNewScenes(undefined)).toEqual(['stress']);
  });

  it('writes a new scene\'s token settings whole, with the switches every Atlas reads', () => {
    expect(newSceneTokenSettings({ hpBar: true }, { showNameplates: false, hiddenResources: [] }))
      .toEqual({ showNameplates: false, hiddenResources: ['stress'], showHPBars: true, showStressBars: false });
  });

  it('names the bars of a collection\'s resources for its default widgets', () => {
    expect(barWidgets([HP, STRESS])).toEqual({ hpBar: true, stressBar: true });
    expect(barWidgets([HP, AMMO])).toEqual({ hpBar: true, stressBar: false });
    expect(barWidgets([])).toEqual({ hpBar: false, stressBar: false });
  });

  it('switches a bar on for new scenes when its resource is added, and off when it goes', () => {
    expect(withChangedBars({ hpBar: true, torch: true }, [HP], [HP, STRESS])).toEqual({ hpBar: true, torch: true, stressBar: true });
    expect(withChangedBars({ hpBar: true, stressBar: true }, [HP, STRESS], [HP])).toEqual({ hpBar: true, stressBar: false });
    // Resources that stay leave the switches as the collection had them
    expect(withChangedBars({ hpBar: false }, [HP, STRESS], [HP, STRESS, AMMO])).toEqual({ hpBar: false });
  });
});

describe('a scene that joins a collection', () => {
  const scene = (tokenSettings: Record<string, unknown> | undefined): string => JSON.stringify({ version: 4, state: { ...(tokenSettings && { tokenSettings }), objects: { tokens: {} } } });
  const settingsOf = (content: string | null): unknown => JSON.parse(content!).state.tokenSettings;

  it('shows the bars a new scene of that collection shows, and keeps its other switches', () => {
    const fromPlain = scene({ showNameplates: true, showHPBars: true, showStressBars: false, hiddenResources: ['stress', 'ammo'] });
    // Into a collection that shows both bars
    expect(settingsOf(sceneAdoption('Daggerheart', { conditions: [], defaultWidgets: { hpBar: true, stressBar: true } }).map(fromPlain)))
      .toMatchObject({ showNameplates: true, showHPBars: true, showStressBars: true, hiddenResources: ['ammo'] });
    // Into one whose scenes start without the HP bar
    expect(settingsOf(sceneAdoption('Quiet', { conditions: [], defaultWidgets: { hpBar: false } }).map(fromPlain)))
      .toMatchObject({ showNameplates: true, showHPBars: false, showStressBars: false, hiddenResources: ['ammo', 'hp', 'stress'] });
  });

  it('writes complete token settings, which a map file replaces as a whole', () => {
    const adopted = settingsOf(sceneAdoption('Quiet', { conditions: [], defaultWidgets: { hpBar: false } }).map(scene(undefined)));
    expect(adopted).toMatchObject({ ...DEFAULT_TOKEN_SETTINGS, hiddenResources: ['hp', 'stress'], showHPBars: false, showStressBars: false });
  });

  it('is left as it is when it already shows them or the collection never set its default widgets, and its snapshots keep their own switches', () => {
    const adopted = sceneAdoption('Own', { conditions: [], defaultWidgets: { hpBar: true, stressBar: true } });
    expect(adopted.map(scene({ showHPBars: true, showStressBars: true, hiddenResources: [] }))).toBeNull();
    expect(adopted.snapshot(scene({ showHPBars: false, showStressBars: false }))).toBeNull();
    expect(sceneAdoption('Bare', { conditions: [] }).map(scene({ showHPBars: false, showStressBars: true }))).toBeNull();
  });
});
