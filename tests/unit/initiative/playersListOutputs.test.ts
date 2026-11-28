// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { App } from 'obsidian';
import type { GmMessage, SharedInitiative } from '../../../src/app/online/protocol/index.ts';
import { CAIRN } from '../../../src/app/gameSystems/presets/cairn';
import { DND_5E } from '../../../src/app/gameSystems/presets/dnd5e';
import type { CollectionLookup } from '../../../src/app/gameSystems/mapRules';
import { MAP_LAYER_INTERVAL_MS } from '../../../src/app/online/gm/MapLayerShare.ts';
import { TOKEN_INTERVAL_MS } from '../../../src/app/online/gm/TokenShare.ts';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';
import { AssetService } from '../../../src/app/services/AssetService';
import { PlayerInitiativePanel } from '../../../src/app/services/PlayerInitiativePanel';
import type { SettingsService } from '../../../src/app/services/SettingsService';
import { SystemPresetService } from '../../../src/app/services/SystemPresetService';
import { SystemPresetFiles } from '../../../src/app/services/systemPresets/SystemPresetFiles';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import type { TokenEntity } from '../../../src/app/types';
import type { CollectionSettings, ConditionDefinition } from '../../../src/app/types/collectionSettingsTypes';
import type { InitiativeRules } from '../../../src/app/types/initiativeRulesTypes';
import type { InitiativeEntry, InitiativeState } from '../../../src/app/types/initiativeTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { memoryPresets } from '../../mocks/memoryPresets';
import { fakeLayers } from '../online/gm/fakeAtlasTab.ts';
import { GENERIC_SOURCE, PLAYER_SETTINGS } from '../online/gm/gmLighting.ts';
import { sceneState, shareHarness } from '../online/gm/shareHarness.ts';
import { preferenceReader } from '../../mocks/preferenceReader';

/** The user's preset: three sides, the hirelings between the party and its foes. */
const HOMEBREW_SIDES: InitiativeRules = {
  mode: 'sides', roll: '1d20', firstSide: 'players', sides: [{ id: 'players' }, { id: 'side-allies', name: 'Allies' }, { id: 'opponents' }], sideRoll: '1d6',
};
const PRONE: ConditionDefinition = { id: 'prone', name: 'Prone', color: '#2222aa', icon: 'skull' };
const VISIBLE_HP = [{ ...HP_RESOURCE, visibleToPlayers: true }];
const MAP = 'atlas-vtt/collections/dungeon/Cave.atlasmap';

const character = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, x: 100, y: 100, imagePath: `art/${id}.webp`, ...changes } as TokenEntity);

/** Every kind of combatant: on each side, hurt, defeated, hidden two ways, beside the map, at the table and added by name. */
const TOKENS: Record<string, TokenEntity> = {
  hero: character('hero', { side: 'players', conditions: ['prone', 'cairn-fatigue'], resources: { hp: { current: 6, max: 10 } } }),
  ogre: character('ogre', { side: 'opponents', resources: { hp: { current: 0, max: 12 }, str: { current: 0, max: 8 } } }),
  lurker: character('lurker', { side: 'opponents', isHidden: true }),
  spy: character('spy', { side: 'opponents' }),
  hireling: character('hireling', { side: 'side-allies' }),
  scout: character('scout', { side: 'players', offMap: true, conditions: ['prone'] }),
};

const entry = (id: string, order: number, changes: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `e_${id}`, ...(id in TOKENS ? { tokenId: id } : {}), name: id, initiative: 20 - order, initiativeModifier: 0, imagePath: id in TOKENS ? `art/${id}.webp` : '', isActive: false, isNPC: true, order, ...changes,
});

const ENTRIES: InitiativeEntry[] = [
  entry('hero', 0),
  entry('ogre', 1),
  entry('lurker', 2),
  entry('spy', 3, { hiddenFromPlayers: true }),
  entry('hireling', 4),
  entry('scout', 5),
  entry('mira', 6, { partyMemberId: 'mira', isNPC: false, conditions: ['prone'] }),
  entry('bandit', 7),
];

/** A combatant as both outputs show it, by its name: its side's name where the list groups by sides, its conditions by name. */
interface Shown {
  name: string;
  side?: string;
  turn?: true;
  defeated?: true;
  delayed?: true;
  /** The share of its life lost, where players see its hit points. */
  wound?: number;
  conditions?: string[];
}

interface Listed {
  isActive: boolean;
  /** The sides' names, in the order they act, where the list groups by sides. */
  sides?: string[];
  combatants: Shown[];
}

interface Row {
  name: string;
  settings: Pick<CollectionSettings, 'conditions'> & Partial<CollectionSettings>;
  /** The settings name the user's preset: it is created and named by its id. */
  userPreset?: InitiativeRules;
  initiative: Partial<InitiativeState>;
  trackerOpen?: boolean;
  shown?: boolean;
  /** What the player window draws; null for nothing. */
  window: Listed | null;
  /** What online players are sent; null for no list. */
  online: Listed | null;
}

const IN_TURN_ORDER: Shown[] = [
  { name: 'hero', wound: 0.4, conditions: ['Prone'] },
  { name: 'ogre', defeated: true, wound: 1 },
  { name: 'hireling', turn: true },
  { name: 'scout', conditions: ['Prone'] },
  { name: 'mira', conditions: ['Prone'] },
  { name: 'bandit', delayed: true },
];

const TURN_ORDER_FIGHT: Partial<InitiativeState> = {
  isActive: true, round: 2,
  entries: ENTRIES.map((listed) => (listed.id === 'e_hireling' ? { ...listed, isActive: true } : listed.id === 'e_bandit' ? { ...listed, delayed: true } : listed)),
};

const CAIRN_FIGHT: Partial<InitiativeState> = { isActive: true, round: 1, entries: ENTRIES, sides: { first: 'players', active: 'opponents' } };
const HOMEBREW_FIGHT: Partial<InitiativeState> = {
  isActive: true, round: 1, entries: ENTRIES, sides: { first: 'players', active: 'side-allies', order: [{ id: 'players' }, { id: 'side-allies', name: 'Allies' }, { id: 'opponents' }] },
};

const CAIRN_SETTINGS = { systemPresetId: CAIRN.id, conditions: CAIRN.rules.conditions, resources: CAIRN.rules.resources };
const BY_CAIRN_SIDES: Shown[] = [
  { name: 'hero', side: 'Players', conditions: ['Fatigue 1'] },
  { name: 'scout', side: 'Players' },
  { name: 'mira', side: 'Players' },
  { name: 'ogre', side: 'Opponents', turn: true, defeated: true },
  { name: 'hireling', side: 'Opponents', turn: true },
  { name: 'bandit', side: 'Opponents', turn: true },
];
const BY_HOMEBREW_SIDES = (turn: string | null): Shown[] => [
  { name: 'hero', side: 'Players', wound: 0.4, conditions: ['Prone'] },
  { name: 'scout', side: 'Players', conditions: ['Prone'] },
  { name: 'mira', side: 'Players', conditions: ['Prone'] },
  { name: 'hireling', side: 'Allies', ...(turn === 'Allies' ? { turn: true as const } : {}) },
  { name: 'ogre', side: 'Opponents', defeated: true, wound: 1 },
  { name: 'bandit', side: 'Opponents' },
];

/** Online players are sent the combatants in turn order, each with its side; their page groups them. */
const inTurnOrder = (grouped: readonly Shown[]): Shown[] =>
  [...grouped].sort((a, b) => ENTRIES.findIndex(({ name }) => name === a.name) - ENTRIES.findIndex(({ name }) => name === b.name));

/** A list grouped by its sides as the player window draws it: by the sides' order, each in turn order. */
function grouped(list: Listed | null): Listed | null {
  if (list?.sides === undefined) return list;
  const { sides } = list;
  return { ...list, combatants: [...list.combatants].sort((a, b) => sides.indexOf(a.side ?? '') - sides.indexOf(b.side ?? '')) };
}
const HOMEBREW_SETTINGS = { conditions: [PRONE], resources: VISIBLE_HP };

const ROWS: Row[] = [
  {
    name: 'a fight in turn order under a built-in preset, players seeing hit points',
    settings: { systemPresetId: DND_5E.id, conditions: [PRONE], resources: VISIBLE_HP },
    initiative: TURN_ORDER_FIGHT,
    window: { isActive: true, combatants: IN_TURN_ORDER },
    online: { isActive: true, combatants: IN_TURN_ORDER },
  },
  {
    name: 'the same combatants before the fight',
    settings: { systemPresetId: DND_5E.id, conditions: [PRONE], resources: VISIBLE_HP },
    initiative: { isActive: false, round: 0, entries: ENTRIES },
    window: null,
    online: { isActive: false, combatants: IN_TURN_ORDER.map(({ turn: _turn, delayed: _delayed, ...rest }) => rest) },
  },
  {
    name: 'a fight by sides under a built-in preset (Cairn), its hit points hidden from players',
    settings: CAIRN_SETTINGS,
    initiative: CAIRN_FIGHT,
    window: { isActive: true, sides: ['Players', 'Opponents'], combatants: BY_CAIRN_SIDES },
    online: { isActive: true, sides: ['Players', 'Opponents'], combatants: inTurnOrder(BY_CAIRN_SIDES) },
  },
  {
    name: 'a fight by the sides of a user preset',
    settings: HOMEBREW_SETTINGS,
    userPreset: HOMEBREW_SIDES,
    initiative: HOMEBREW_FIGHT,
    window: { isActive: true, sides: ['Players', 'Allies', 'Opponents'], combatants: BY_HOMEBREW_SIDES('Allies') },
    online: { isActive: true, sides: ['Players', 'Allies', 'Opponents'], combatants: inTurnOrder(BY_HOMEBREW_SIDES('Allies')) },
  },
  {
    name: 'the user preset\'s sides before the fight',
    settings: HOMEBREW_SETTINGS,
    userPreset: HOMEBREW_SIDES,
    initiative: { isActive: false, round: 0, entries: ENTRIES },
    window: null,
    online: { isActive: false, sides: ['Players', 'Allies', 'Opponents'], combatants: inTurnOrder(BY_HOMEBREW_SIDES(null)) },
  },
  {
    name: 'a fight while the GM\'s tracker is closed',
    settings: HOMEBREW_SETTINGS,
    userPreset: HOMEBREW_SIDES,
    initiative: HOMEBREW_FIGHT,
    trackerOpen: false,
    window: null,
    online: null,
  },
  {
    name: 'a fight while the player view does not show initiative',
    settings: { systemPresetId: DND_5E.id, conditions: [PRONE], resources: VISIBLE_HP },
    initiative: TURN_ORDER_FIGHT,
    shown: false,
    window: null,
    online: null,
  },
];

/** The combatants the player window draws (`PlayerInitiativePanel`), read from its cards. */
function windowList(container: Element): Listed | null {
  const panel = container.querySelector('.atlas-player-initiative:not(.atlas-player-initiative--leaving)');
  if (panel === null) return null;
  const sideNames = [...panel.querySelectorAll('.atlas-initiative-side:not(.atlas-initiative-side--delayed)')].map((side) => side.getAttribute('aria-label') ?? '');
  const combatants = [...panel.querySelectorAll<HTMLElement>('.atlas-initiative-card')].map((card): Shown => {
    const side = card.closest('.atlas-initiative-side:not(.atlas-initiative-side--delayed)');
    const wound = card.querySelector<HTMLElement>('.atlas-initiative-wound')?.style.getPropertyValue('--atlas-wound');
    const conditions = [...card.querySelectorAll('.atlas-initiative-card__condition')].map((badge) => badge.getAttribute('aria-label') ?? '');
    const key = card.getAttribute('data-turn-key') ?? '';
    return {
      name: key.replace(/^name:/, ''),
      ...(side ? { side: side.getAttribute('aria-label') ?? '' } : {}),
      ...(card.classList.contains('atlas-initiative-card--active') || side?.classList.contains('atlas-initiative-side--active') ? { turn: true as const } : {}),
      ...(card.classList.contains('atlas-initiative-card--defeated') ? { defeated: true as const } : {}),
      ...(card.classList.contains('atlas-initiative-card--delayed') ? { delayed: true as const } : {}),
      ...(wound ? { wound: Number(wound) } : {}),
      ...(conditions.length ? { conditions } : {}),
    };
  });
  return { isActive: panel.querySelector('.atlas-initiative-panel__round') !== null, ...(sideNames.length ? { sides: sideNames } : {}), combatants };
}

/** The combatants online players are sent, with the names of the map's `conditions` for the colours sent. */
function onlineList(list: SharedInitiative | null, conditions: readonly ConditionDefinition[]): Listed | null {
  if (list === null) return null;
  const sideName = new Map((list.sides ?? []).map((side) => [side.id, side.name]));
  const conditionName = new Map(conditions.map((condition) => [condition.color, condition.name]));
  const turnSides = new Set((list.sides ?? []).filter((side) => side.turn).map((side) => side.id));
  return {
    isActive: list.isActive,
    ...(list.bySides ? { sides: (list.sides ?? []).map((side) => side.name) } : {}),
    combatants: list.combatants.map((combatant): Shown => {
      const side = combatant.sideId ?? combatant.side;
      return {
        name: combatant.name ?? '',
        ...(list.bySides ? { side: sideName.get(side) ?? side } : {}),
        ...(combatant.turn || (list.bySides && turnSides.has(side)) ? { turn: true as const } : {}),
        ...(combatant.defeated ? { defeated: true as const } : {}),
        ...(combatant.delayed ? { delayed: true as const } : {}),
        ...(combatant.hp ? { wound: 1 - combatant.hp.current / combatant.hp.max } : {}),
        ...(combatant.conditions?.length ? { conditions: combatant.conditions.map(({ colour, value }) => [conditionName.get(colour) ?? colour, ...(value === null ? [] : [value])].join(' ')) } : {}),
      };
    }),
  };
}

const lastList = (sent: readonly { body: GmMessage }[]): SharedInitiative | null | undefined =>
  sent.flatMap(({ body }) => (body.t === 'initiative' ? [(body as Extract<GmMessage, { t: 'initiative' }>).list] : [])).at(-1);

/** The map's collection as both outputs look it up; its settings name the user's preset where the row has one. */
function collectionOf(app: App, row: Row): CollectionLookup & { initialize(): Promise<void> } {
  const presets = memoryPresets();
  vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(presets as unknown as SystemPresetFiles);
  const preset = row.userPreset ? new SystemPresetService(presets).create('Homebrew', { ...DND_5E.rules, initiative: row.userPreset }) : undefined;
  const settings = { ...row.settings, ...(preset ? { systemPresetId: preset.id } : {}) } as CollectionSettings;
  const collections = { getCollectionForMap: () => 'dungeon', getCollectionSettings: () => settings, initialize: () => Promise.resolve() };
  vi.spyOn(AssetService, 'getInstance').mockImplementation((of) => (of === app ? collections : undefined) as unknown as AssetService);
  return collections;
}

const sceneOf = (row: Row): Pick<ViewAtlasState, 'initiative' | 'initiativeTrackerOpen' | 'mapPath' | 'objects' | 'tokenSettings'> => ({
  mapPath: MAP,
  initiative: { entries: [], round: 0, isActive: false, ...row.initiative },
  initiativeTrackerOpen: row.trackerOpen ?? true,
  objects: { ...sceneState().objects, tokens: TOKENS },
  tokenSettings: { showNameplates: true, hiddenResources: [], showInstanceBadges: false, tokenRingSize: 1 },
});

/** The player window's list of the row's scene, drawn at true scale so every card shows its conditions as online players are sent them. */
function windowOf(app: App, row: Row): Listed | null {
  const settings = {
    get: preferenceReader({
      localPlayerView: () => ({ showInitiative: row.shown ?? true, showTokenNameplates: true }),
      initiativeLayout: () => ({ fromTurn: false, dock: 'right', edges: ['right'], facesPlayers: false }),
      initiativeTurnOptions: () => ({ banner: false }),
    }),
    onChange: () => () => undefined,
  } as unknown as SettingsService;
  const host = document.body.createDiv();
  const panel = new PlayerInitiativePanel(app, settings, () => true);
  panel.mount(host);
  panel.present(createStore(() => sceneOf(row)) as unknown as StoreApi<ViewAtlasState>);
  try {
    return windowList(host);
  } finally {
    panel.destroy();
    host.remove();
  }
}

async function onlineOf(app: App, row: Row, collections: CollectionLookup): Promise<Listed | null> {
  const state = { ...sceneState(), ...sceneOf(row) } as Parameters<typeof shareHarness>[0];
  const harness = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
  harness.settings = { ...PLAYER_SETTINGS, showInitiative: row.shown ?? true };
  harness.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, collections, app });
  harness.share.start();
  await harness.advance(TOKEN_INTERVAL_MS);
  await harness.advance(MAP_LAYER_INTERVAL_MS);
  const sent = lastList(harness.sent);
  expect(sent).not.toBeUndefined();
  return onlineList(sent ?? null, row.settings.conditions ?? []);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
});

describe('the players\' initiative list in the player window and online', () => {
  it.each(ROWS)('$name', async (row) => {
    const { app } = createInMemoryApp({ files: {} });
    const collections = collectionOf(app, row);
    expect(windowOf(app, row)).toEqual(row.window);
    expect(await onlineOf(app, row, collections)).toEqual(row.online);
  });

  it('shows the same combatants and sides in both while a fight runs', async () => {
    for (const row of ROWS.filter(({ window }) => window !== null)) {
      const { app } = createInMemoryApp({ files: {} });
      const collections = collectionOf(app, row);
      expect(grouped(await onlineOf(app, row, collections))).toEqual(windowOf(app, row));
      vi.restoreAllMocks();
    }
  });
});
