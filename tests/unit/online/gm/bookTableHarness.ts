import type { PlayerInfo } from '../../../../src/app/online/protocol/index.ts';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { BookShelf, BookSource } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { isEmptyBook, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, atlasTab, FakeSocket, png, present, workspace, type FakeTab } from './fakeTable.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { advanceSettled } from './settled.ts';
import { sceneState } from './shareHarness.ts';
import { setWorldMapGate, type WorldMapTree } from '../../../../src/app/online/gm/book/worldMapGate.ts';
import { NO_STRETCH } from '../../../../src/app/grid/mapStretch';

/*
 * A running table with two heroes in a cave of the collection `Cairn`, for tests of the players'
 * books. Each test file mocks `obsidian` and the GM's marks itself.
 */

/** A message the companion sent, as the player it went to reads it: a message sent in parts is put together. */
export interface Delivered {
  readonly to: string;
  readonly body: Readonly<Record<string, unknown>>;
}

interface Part {
  readonly id: string;
  readonly index: number;
  readonly count: number;
  readonly data: string;
}

/** Every game message the socket was given, in order, with who it was for; parts as the one message they make. */
export function delivered(socket: FakeSocket): Delivered[] {
  const parts = new Map<string, string[]>();
  return socket.frames().flatMap((frame): Delivered[] => {
    if (frame.t !== 'send' || frame.body === undefined) return [];
    const to = frame.to ?? '';
    const body = frame.body as Readonly<Record<string, unknown>>;
    if (body.t !== 'part') return [{ to, body }];
    const part = body as unknown as Part;
    const held = parts.get(`${to}\n${part.id}`) ?? [];
    held[part.index] = part.data;
    parts.set(`${to}\n${part.id}`, held);
    if (held.filter((data) => typeof data === 'string').length < part.count) return [];
    return [{ to, body: JSON.parse(Buffer.concat(held.map((data) => Buffer.from(data, 'base64'))).toString('utf8')) as Record<string, unknown> }];
  });
}

/** The messages of these types among them. */
export const ofType = (messages: readonly Delivered[], ...types: readonly string[]): Delivered[] => messages.filter(({ body }) => types.includes(String(body.t)));

/** Everything sent as text, whoever it was for: what a secret is searched in. */
export const traffic = (messages: readonly Delivered[]): string => messages.map(({ body }) => JSON.stringify(body)).join('\n');

export const ANA = 'anaanaanaanaanaanaan';
export const BEN = 'benbenbenbenbenbenbe';
export const CAL = 'calcalcalcalcalcalca';
export const MAP = 'atlas-vtt/collections/Cairn/scenes/Cave.atlasmap';
export const WORLD_MAP = 'atlas-vtt/collections/Cairn/maps/The Wide World.png';
export const BRANNOCH = 'tok-brannoch';
export const MIRA = 'tok-mira';
export const BRANNOCH_ART = 'atlas-vtt/collections/Cairn/tokens/brannoch.png';
export const MIRA_ART = 'atlas-vtt/collections/Cairn/tokens/mira.png';
/** The keys of the two heroes' books: their tokens were placed from no library token. */
export const BRANNOCH_BOOK = `token:${BRANNOCH}`;
export const MIRA_BOOK = `token:${MIRA}`;
/** A source that keeps books in a map, as the campaign's file does: what was written is everything `dump` reads. */
export interface KeptBooks extends BookSource {
  /** How many times a book was handed to the source to keep. */
  writes: number;
  dump(): string;
}

export function keptBooks(): KeptBooks {
  const kept = new Map<string, StoredBook>();
  return {
    writes: 0,
    read: (characterId) => kept.get(characterId),
    write(characterId, book) {
      this.writes += 1;
      if (isEmptyBook(book)) kept.delete(characterId);
      else kept.set(characterId, book);
      return true;
    },
    dump: () => JSON.stringify([...kept]),
  };
}

/** A value of the resource players never see: found in what was sent, it leaked. */
export const DOOM = 31337;
export const MIRA_DOOM = 27182;

const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: MAP, gate: { code: '483912', requireCode: false, askToJoin: false } };

/** The collection's resources: hit points players see, and a doom track hidden from players: only a character's own player sees theirs. */
const RESOURCES: readonly ResourceDefinition[] = [
  { key: 'hp', name: 'Hit Points', field: 'hp', direction: 'drains', color: '#CC3333', visibleToPlayers: true },
  { key: 'doom', name: 'Doom Track', field: 'doom', direction: 'fills', color: '#333333', visibleToPlayers: false },
];

const hero = (id: string, name: string, imagePath: string, hp: number, doom: number): TokenEntity => ({
  id, kind: 'character', name, imagePath, x: 140, y: 140, ringColor: '#abc', resources: { hp: { current: hp, max: 12 }, doom: { current: doom, max: 99999 } },
});

/** The cave with Brannoch and Mira in it, in that order; `changes` are other fields of the two tokens. */
export function cave(changes: { readonly brannoch?: Partial<TokenEntity>; readonly mira?: Partial<TokenEntity> } = {}): SceneState {
  const tokens = {
    [BRANNOCH]: { ...hero(BRANNOCH, 'Brannoch', BRANNOCH_ART, 7, DOOM), ...changes.brannoch } as TokenEntity,
    [MIRA]: { ...hero(MIRA, 'Mira', MIRA_ART, 4, MIRA_DOOM), ...changes.mira } as TokenEntity,
  };
  return sceneState({ mapPath: MAP, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens } });
}

/** The vault of the tests: the cave's map, the two heroes' artwork and the campaign's world map. */
export function vaultFiles(): Map<string, Uint8Array> {
  return new Map([['maps/cave.png', png(700, 700)], [BRANNOCH_ART, png(4, 4)], [MIRA_ART, png(6, 6)], [WORLD_MAP, png(1200, 800)]]);
}

/** The image the world map of the campaign being played names; null while none is played or it names none. */
let named: string | null = WORLD_MAP;
/** The maps the world map leads into, where a test names them (`nameWorldMapTree`). */
let tree: WorldMapTree | null = null;
const worldMapListeners = new Set<() => void>();

/**
 * The campaign being played names another world map, or none (another campaign is played, the
 * GM stops playing, or edits the campaign's world map), and Atlas says so.
 */
export function nameWorldMap(path: string | null): void {
  named = path;
  tree = null;
  for (const listener of [...worldMapListeners]) listener();
}

/** The campaign being played names a world map whose pins lead into other maps. */
export function nameWorldMapTree(next: WorldMapTree): void {
  tree = next;
  for (const listener of [...worldMapListeners]) listener();
}

/** The world map as Atlas answers, in short: an image under a maps folder is the artwork of the map the campaign names, anything else in the vault is not. */
function answer(): WorldMapTree | null {
  if (tree !== null) return tree;
  return named?.includes('maps/') === true ? { root: 'world', levels: [{ key: 'world', title: 'World', image: named, stretch: NO_STRETCH, entrances: [] }] } : null;
}

export interface OpenTable {
  readonly online: OnlineControl;
  readonly ownership: Ownership;
  readonly socket: FakeSocket;
  readonly tab: FakeTab;
  /** A player's message, as the relay hands it on. */
  from(player: string, body: object): void;
}

/**
 * A table that came back with the cave presented, welcomed with these players: Ana plays Brannoch
 * and Ben plays Mira unless `owners` says otherwise. The campaign being played names the world map
 * and has these players unless `campaign` names others (a player may join who it has not met).
 * The heroes' tokens are placed from no library token unless `heroes` gives them an `assetId`.
 */
export async function openTable(shelf: BookShelf, players: readonly PlayerInfo[], owners: Readonly<Record<string, string>> = { [BRANNOCH]: ANA, [MIRA]: BEN }, campaign: readonly PlayerInfo[] = players, heroes: Parameters<typeof cave>[0] = {}): Promise<OpenTable> {
  workspace.files = vaultFiles();
  named = WORLD_MAP;
  tree = null;
  setWorldMapGate({
    worldMap: () => Promise.resolve(answer()),
    onChange: (listener) => {
      worldMapListeners.add(listener);
      return () => void worldMapListeners.delete(listener);
    },
  });
  workspace.assets = {
    getCollectionForMap: (path: string) => (path.includes('collections/Cairn/') ? 'Cairn' : null),
    getCollectionSettings: () => ({ conditions: [] }),
  };
  const tab = atlasTab(cave(heroes));
  tab.view.renderer = {
    ...fakeTokenSource(() => tab.store.getState(), () => undefined, () => 70),
    getTokenRenderer: () => ({ collectionSync: { resources: () => RESOURCES, conditions: () => [] } }),
  };
  workspace.leaves = [tab.leaf];
  present(tab);
  const ownership = boundOwnership(campaign, { owners, playerTokens: {} });
  const online = new OnlineControl(app, ownership, fakeCampaigns(campaign, { owners, playerTokens: {} }), undefined, undefined, undefined, shelf);
  void online.resume(SAVED);
  await advanceSettled(0);
  const socket = FakeSocket.all.at(-1);
  if (socket === undefined) throw new Error('no socket');
  socket.relay({ t: 'welcome', role: 'gm', players });
  await advanceSettled(1_000);
  return { online, ownership, socket, tab, from: (player, body) => socket.relay({ t: 'game', from: player, body }) };
}
