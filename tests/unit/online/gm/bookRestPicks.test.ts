import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGmMessage, type BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { BOOK_POLL_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setRestGate, type CheckedRest, type RestAlly, type RestGate, type TakenRest } from '../../../../src/app/online/gm/book/restGate.ts';
import { restKey } from '../../../../src/app/online/gm/book/restRequests.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { RestSummary } from '../../../../src/app/recovery/restEvents';
import { checkRest, type RestOffer, type RestRequest } from '../../../../src/app/recovery/restOffer';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, CAL, cave, delivered, ofType, openTable, type Delivered } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { StatblockNotes, templateOf } from './statblockNotes.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CAL, name: 'Cal' }];
const BRANNOCH_NOTE = 'Characters/Brannoch.md';
const MIRA_NOTE = 'Characters/Mira.md';
const BRANNOCH_PC = 'pc-brannoch';
const MIRA_PC = 'pc-mira';

const FIELDS: TemplateField[] = [{ key: 'name', label: 'Name', type: 'text' }, { key: 'speed', label: 'Speed', type: 'text' }];
const BLOCKS: TemplateBlock[] = [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }];
const TEMPLATE = templateOf(FIELDS, BLOCKS);
const note = (name: string): string => ['---', 'statblock: true', `atlas-template: ${TEMPLATE.id}`, `name: ${name}`, 'speed: 30 ft.', '---', ''].join('\n');

/** Brannoch's short rest: two downtime moves, Tend to Wounds also for another, Clear Stress spending Hope. */
const OFFERS: RestOffer[] = [{
  id: 'short', name: 'Short rest', spends: [],
  choices: [{
    id: 'moves', prompt: 'Choose two downtime moves', min: 2, max: 2, repeat: true,
    actions: [
      { id: 'tend', name: 'Tend to Wounds', text: 'Clear 1d4 Hit Points.', forOthers: true, spends: [] },
      { id: 'stress', name: 'Clear Stress', text: '', forOthers: false, spends: [{ rule: 0, label: 'Hope', each: '1', max: 2 }] },
    ],
  }],
}];

/** Atlas's recovery buttons as this test holds them: Brannoch offers his short rest, Mira none; names come from the allies asked with. */
class FakeRests implements RestGate {
  readonly taken: { request: RestRequest; allies: readonly RestAlly[] }[] = [];
  readonly checkedWith: (readonly RestAlly[])[] = [];
  private readonly listeners = new Set<(rest: RestSummary) => void>();

  offers(path: string, character: string): readonly RestOffer[] | null {
    return path === BRANNOCH_NOTE && character === BRANNOCH_PC ? OFFERS : null;
  }

  check(path: string, character: string, request: RestRequest, allies: readonly RestAlly[]): CheckedRest | null {
    this.checkedWith.push(allies);
    const offers = this.offers(path, character);
    const fit = offers === null ? null : checkRest(offers, request, new Set(allies.map((ally) => ally.character)));
    if (fit === null) return null;
    const picks = fit.choices.picks.map((pick) => (pick.for === null ? pick.action : `${pick.action} for ${pick.for}`));
    return { button: fit.button.name, picks, rules: [] };
  }

  take(_path: string, _character: string, request: RestRequest, allies: readonly RestAlly[]): Promise<TakenRest> {
    this.taken.push({ request, allies });
    return Promise.resolve('done');
  }

  onRested(listener: (rest: RestSummary) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  announce(rest: RestSummary): void {
    for (const listener of [...this.listeners]) listener(rest);
  }
}

function statblocks(messages: readonly Delivered[], player: string): (BookStatblock | null)[] {
  return ofType(messages, 'book-statblock').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book-statblock') throw new Error('a statblock the page would not read');
    return read.statblock;
  });
}

const answers = (messages: readonly Delivered[], player: string): string[] =>
  ofType(messages, 'book-rest-answer').filter(({ to }) => to === player).map(({ body }) => String(body.outcome));

const REQUEST = 'a'.repeat(24);

describe('rests whose steps a player picks actions in, for themselves or another character at the table', () => {
  let rests: FakeRests;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
    const notes = new StatblockNotes().install();
    notes.put(BRANNOCH_NOTE, TEMPLATE, note('Brannoch'));
    notes.put(MIRA_NOTE, TEMPLATE, note('Mira'));
    rests = new FakeRests();
    setRestGate(rests);
  });

  afterEach(() => {
    setStatblockGate(null);
    setRestGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Ana plays Brannoch, Ben plays Mira, Cal plays nobody; Brannoch's statblock names Mira by her table id. */
  async function table(): Promise<Awaited<ReturnType<typeof openTable>> & { brannoch: string; mira: string }> {
    const opened = await openTable(new BookShelf(), PLAYERS);
    opened.tab.store.set(cave({ brannoch: { statblockPath: BRANNOCH_NOTE, assetId: BRANNOCH_PC }, mira: { statblockPath: MIRA_NOTE, assetId: MIRA_PC } }));
    await advance(BOOK_POLL_MS);
    const sheet = statblocks(delivered(opened.socket), ANA).at(-1);
    const mira = sheet?.allies?.[0]?.id;
    if (sheet?.characterId === undefined || mira === undefined) throw new Error('Brannoch\'s statblock names no character or ally');
    return { ...opened, brannoch: sheet.characterId, mira };
  }

  it('sends the steps of a button and the other characters at the table, by their table ids', async () => {
    const { online, socket, brannoch, mira } = await table();
    const ana = statblocks(delivered(socket), ANA).at(-1);
    expect(ana?.recovery?.[0]?.choices).toEqual([{
      id: 'moves', prompt: 'Choose two downtime moves', min: 2, max: 2, repeat: true,
      actions: [
        { id: 'tend', name: 'Tend to Wounds', text: 'Clear 1d4 Hit Points.', forOthers: true, spends: [] },
        { id: 'stress', name: 'Clear Stress', text: '', forOthers: false, spends: [{ label: 'Hope', most: 2 }] },
      ],
    }]);
    expect(ana?.allies).toEqual([{ id: mira, name: 'Mira' }]);
    expect(mira).toMatch(/^[0-9a-f]{24}$/);
    expect(mira).not.toBe(brannoch);
    // No library id leaves the GM, and Mira, who offers no rests, gets none and no allies.
    expect(JSON.stringify(delivered(socket))).not.toContain(MIRA_PC);
    expect(statblocks(delivered(socket), BEN).at(-1)?.allies).toBeUndefined();
    online.stop();
  });

  it('takes a request whose picks fit, an ally named by its book key, and names the picks on the GM\'s card', async () => {
    const { online, socket, from, brannoch, mira } = await table();
    from(ANA, {
      t: 'book-rest', request: REQUEST, character: brannoch, button: 'short', spends: [],
      picks: [{ choice: 'moves', action: 'tend', for: mira, spends: [] }, { choice: 'moves', action: 'stress', for: null, spends: [1] }],
    });
    await advance(ARM_MS);
    const key = restKey(brannoch);
    expect(online.table?.rests.cards()).toMatchObject([{ key, button: 'Short rest', picks: [`tend for ${MIRA_PC}`, 'stress'], armed: true }]);
    expect(rests.checkedWith.at(-1)).toEqual([{ character: MIRA_PC, path: MIRA_NOTE }]);
    const since = delivered(socket).length;
    online.table?.rests.approve(key);
    await advance(BOOK_POLL_MS);
    expect(rests.taken).toEqual([{
      request: { button: 'short', spends: [], picks: [{ choice: 'moves', action: 'tend', for: MIRA_PC, spends: [] }, { choice: 'moves', action: 'stress', for: null, spends: [1] }] },
      allies: [{ character: MIRA_PC, path: MIRA_NOTE }],
    }]);
    expect(answers(delivered(socket).slice(since), ANA)).toEqual(['done']);
    online.stop();
  });

  it('refuses picks for a character the table never named or for the resting one, and picks that do not fit the step', async () => {
    const { online, socket, from, brannoch, mira } = await table();
    const since = delivered(socket).length;
    const ask = (picks: unknown): void => from(ANA, { t: 'book-rest', request: REQUEST, character: brannoch, button: 'short', spends: [], picks });
    ask([{ choice: 'moves', action: 'tend', for: 'f'.repeat(24), spends: [] }, { choice: 'moves', action: 'tend', for: null, spends: [] }]);
    ask([{ choice: 'moves', action: 'tend', for: brannoch, spends: [] }, { choice: 'moves', action: 'tend', for: null, spends: [] }]);
    // Clear Stress is for oneself alone, one pick is too few, and Hope cannot be spent thrice.
    ask([{ choice: 'moves', action: 'stress', for: mira, spends: [0] }, { choice: 'moves', action: 'tend', for: null, spends: [] }]);
    ask([{ choice: 'moves', action: 'tend', for: null, spends: [] }]);
    ask([{ choice: 'moves', action: 'stress', for: null, spends: [3] }, { choice: 'moves', action: 'tend', for: null, spends: [] }]);
    await advance(100);
    expect(answers(delivered(socket).slice(since), ANA)).toEqual(['refused', 'refused', 'refused', 'refused', 'refused']);
    expect(online.table?.rests.cards()).toEqual([]);
    online.stop();
  });

  it('logs the picks for everyone, all changes to the resting character\'s player, and an ally\'s own changes to theirs', async () => {
    const { online, socket } = await table();
    const since = delivered(socket).length;
    rests.announce({
      characterId: BRANNOCH_PC, characterName: 'Brannoch', notePath: BRANNOCH_NOTE, button: { id: 'short', name: 'Short rest' }, picks: ['Tend to Wounds', 'Clear Stress'],
      changes: [
        { character: { id: BRANNOCH_PC, name: 'Brannoch' }, target: { kind: 'resource', key: 'stress' }, label: 'Stress', from: 3, to: 2, rolls: [] },
        { character: { id: MIRA_PC, name: 'Mira' }, target: { kind: 'resource', key: 'hp' }, label: 'Hit Points', from: 2, to: 6, rolls: [{ formula: '1d4', total: 4 }] },
      ],
      skipped: [], text: '',
    });
    await advance(100);
    const rested = (player: string): Record<string, unknown> | undefined =>
      ofType(delivered(socket).slice(since), 'log-entry').map(({ body, to }) => ({ entry: body.entry as Record<string, unknown>, to }))
        .find(({ entry, to }) => entry.kind === 'rest' && (to === undefined || to === player))?.entry;
    const mine = { label: 'Stress', from: 3, to: 2 };
    const hers = { label: 'Hit Points', from: 2, to: 6, roll: '1d4 = 4', character: 'Mira' };
    expect(rested(ANA)).toMatchObject({ character: 'Brannoch', button: 'Short rest', picks: ['Tend to Wounds', 'Clear Stress'], changes: [mine, hers] });
    // The ally's player sees their character's change, without the roll that carries the resting character's numbers
    const { roll: _roll, ...hersWithoutRoll } = hers;
    expect(rested(BEN)).toMatchObject({ picks: ['Tend to Wounds', 'Clear Stress'], changes: [hersWithoutRoll] });
    expect((rested(BEN)?.changes as Array<Record<string, unknown>>)[0]).not.toHaveProperty('roll');
    expect(rested(CAL)).toMatchObject({ picks: ['Tend to Wounds', 'Clear Stress'] });
    expect(rested(CAL)).not.toHaveProperty('changes');
    expect(JSON.stringify(delivered(socket))).not.toContain('changePlayers');
    expect(online.table?.log.entries().find((entry) => entry.kind === 'rest')).toMatchObject({ changes: [mine, hers] });
    online.stop();
  });
});
