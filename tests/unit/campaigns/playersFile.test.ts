import { describe, expect, it } from 'vitest';
import {
  emptyPlayers, isPlayersPath, newLinkCode, newPlayerCode, newPlayerId, PLAYERS_LAYOUT, readPlayers,
  withCharacterOwner, withLink, withoutPlayer, withPlayer, withPlayerFields, type StoredPlayers,
} from '../../../src/app/campaigns/players/playersFile';
import { CAMPAIGNS_FOLDER } from '../../../src/app/campaigns/campaignPaths';
import { JOIN_CODE_PATTERN, MAX_CAMPAIGN_PLAYERS, PLAYER_ID_PATTERN, TABLE_CODE_PATTERN } from '../../../src/app/online/protocol/index';

const letter = (n: number): string => String.fromCharCode(97 + n);
const idOf = (n: number): string => `p${letter(Math.floor(n / 26))}${letter(n % 26)}`.padEnd(20, 'a');
const codeOf = (n: number): string => String(n).padStart(6, '0');
const entry = (n: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ name: `Player ${n}`, code: codeOf(n), characters: [], addedAt: 1, ...extra });
const stored = (players: Record<string, unknown>, extra: Record<string, unknown> = {}): StoredPlayers => ({ id: 'c1', campaignId: 'c1', players, ...extra });
const seq = (...values: number[]): (() => number) => { const rest = [...values]; return () => rest.shift() ?? 0; };

describe('players paths', () => {
  it('are players.json directly in a campaign\'s folder', () => {
    expect(isPlayersPath(`${CAMPAIGNS_FOLDER}/Witherwild/players.json`)).toBe(true);
    expect(isPlayersPath(`${CAMPAIGNS_FOLDER}/players.json`)).toBe(false);
    expect(isPlayersPath(`${CAMPAIGNS_FOLDER}/Witherwild/sessions/players.json`)).toBe(false);
    expect(isPlayersPath(`${CAMPAIGNS_FOLDER}/Witherwild/characters.json`)).toBe(false);
  });

  it('are read and written with the campaign id as the record id, keeping unknown fields and a later format', () => {
    const text = `${JSON.stringify({ format: 1, campaignId: 'c1', link: 'x', future: { a: 1 }, players: {} })}\n`;
    const record = PLAYERS_LAYOUT.read(text)!;
    expect(record.id).toBe('c1');
    expect(JSON.parse(PLAYERS_LAYOUT.text(record))).toEqual({ format: 1, campaignId: 'c1', link: 'x', future: { a: 1 }, players: {} });
    expect(PLAYERS_LAYOUT.read('{"format":1,"players":{}}')).toBeNull();
    expect(PLAYERS_LAYOUT.read('not json')).toBeNull();
    const later = PLAYERS_LAYOUT.read('{"format":2,"campaignId":"c1","players":{}}')!;
    expect(JSON.parse(PLAYERS_LAYOUT.text(later)).format).toBe(2);
  });
});

describe('readPlayers', () => {
  it('keeps a valid player', () => {
    const file = stored({ [idOf(1)]: entry(1, { name: '  Mira  ', characters: ['tok1', 'tok2'] }) });
    expect(readPlayers(file)).toEqual([{ id: idOf(1), name: 'Mira', code: '000001', characters: ['tok1', 'tok2'] }]);
  });

  it('drops an entry with a bad id, a bad code or a name that shows nothing', () => {
    const file = stored({
      [idOf(1)]: entry(1),
      BAD: entry(2),
      [idOf(3)]: entry(3, { code: '12345' }),
      [idOf(4)]: entry(4, { name: '​ ⠀' }),
      [idOf(5)]: 'not an entry',
    });
    expect(readPlayers(file).map((player) => player.id)).toEqual([idOf(1)]);
  });

  it('drops the 65th player and a player whose code an earlier one has', () => {
    const players: Record<string, unknown> = {};
    for (let n = 1; n <= MAX_CAMPAIGN_PLAYERS + 1; n += 1) players[idOf(n)] = entry(n);
    const read = readPlayers(stored(players));
    expect(read).toHaveLength(MAX_CAMPAIGN_PLAYERS);
    expect(read.at(-1)?.id).toBe(idOf(MAX_CAMPAIGN_PLAYERS));
    expect(readPlayers(stored({ [idOf(1)]: entry(1), [idOf(2)]: entry(2, { code: codeOf(1) }) })).map((player) => player.id)).toEqual([idOf(1)]);
  });

  it('keeps a character under the first player in id order when two list it', () => {
    const file = stored({ [idOf(2)]: entry(2, { characters: ['tok1', 'tok2'] }), [idOf(1)]: entry(1, { characters: ['tok1'] }) });
    expect(readPlayers(file).map((player) => [player.id, player.characters])).toEqual([[idOf(1), ['tok1']], [idOf(2), ['tok2']]]);
  });

  it('reads nothing from a file without players', () => {
    expect(readPlayers(emptyPlayers('c1'))).toEqual([]);
    expect(readPlayers(stored([] as unknown as Record<string, unknown>))).toEqual([]);
  });
});

describe('changing a players file', () => {
  it('withPlayer adds or renames a player and keeps their added time and other fields', () => {
    const file = stored({ [idOf(1)]: entry(1, { addedAt: 7, note: 'kept' }) }, { future: true });
    const added = withPlayer(file, { id: idOf(2), name: 'Bram', code: codeOf(2), characters: ['tok9'] }, 99);
    expect(added.players).toMatchObject({ [idOf(2)]: { name: 'Bram', code: codeOf(2), characters: ['tok9'], addedAt: 99 } });
    const renamed = withPlayer(added, { id: idOf(1), name: 'Mira', code: codeOf(1), characters: [] }, 100);
    expect(renamed.players).toMatchObject({ [idOf(1)]: { name: 'Mira', addedAt: 7, note: 'kept' } });
    expect(renamed.future).toBe(true);
  });

  it('withoutPlayer removes a player and nobody else', () => {
    const file = stored({ [idOf(1)]: entry(1), [idOf(2)]: entry(2) });
    expect(Object.keys(withoutPlayer(file, idOf(1)).players as object)).toEqual([idOf(2)]);
  });

  it('withCharacterOwner leaves a character with one player, or with nobody', () => {
    const file = stored({ A: entry(1, { characters: ['tok1', 'tok2'] }), B: entry(2, { characters: [] }) });
    const moved = withCharacterOwner(file, 'tok1', 'B');
    expect(moved.players).toMatchObject({ A: { characters: ['tok2'] }, B: { characters: ['tok1'] } });
    expect(withCharacterOwner(moved, 'tok1', null).players).toMatchObject({ A: { characters: ['tok2'] }, B: { characters: [] } });
    expect(withCharacterOwner(file, 'tok1', 'A').players).toMatchObject({ A: { characters: ['tok1', 'tok2'] } });
  });

  it('withCharacterOwner changes nothing for a player the file does not have', () => {
    const file = stored({ A: entry(1, { characters: ['tok1'] }) });
    expect(withCharacterOwner(file, 'tok1', 'GONE')).toBe(file);
  });

  it('withPlayerFields changes a player\'s name or code and nothing else of theirs, and nothing for a player the file does not have', () => {
    const file = stored({ [idOf(1)]: entry(1, { characters: ['tok1'], colour: 'red' }), [idOf(2)]: entry(2) });
    expect(withPlayerFields(file, idOf(1), { code: codeOf(9) }).players).toEqual({ [idOf(1)]: { ...entry(1, { characters: ['tok1'], colour: 'red' }), code: codeOf(9) }, [idOf(2)]: entry(2) });
    expect(withPlayerFields(file, idOf(1), { name: 'Mira' }).players).toMatchObject({ [idOf(1)]: { name: 'Mira', code: codeOf(1) } });
    expect(withPlayerFields(file, idOf(3), { name: 'Mira' })).toBe(file);
    expect(withPlayerFields({ ...file, format: 2 }, idOf(1), { name: 'Mira' }).players).toBe(file.players);
  });

  it('withLink sets the table code', () => {
    expect(withLink(emptyPlayers('c1'), 'a'.repeat(26)).link).toBe('a'.repeat(26));
  });

  it('keeps unknown top-level and per-player fields through withPlayer', () => {
    const file = stored({ [idOf(1)]: entry(1, { colour: 'red' }) }, { future: { a: 1 } });
    const next = withPlayer(file, { id: idOf(1), name: 'Mira', code: codeOf(1), characters: ['tok1'] }, 5);
    expect(next.future).toEqual({ a: 1 });
    expect((next.players as Record<string, Record<string, unknown>>)[idOf(1)]?.colour).toBe('red');
  });

  it('a later format is never written', () => {
    const file = stored({ A: entry(1, { characters: ['tok1'] }) }, { format: 2 });
    const player = { id: idOf(2), name: 'Bram', code: codeOf(2), characters: [] };
    expect(withPlayer(file, player)).toBe(file);
    expect(withoutPlayer(file, 'A')).toBe(file);
    expect(withCharacterOwner(file, 'tok1', null)).toBe(file);
    expect(withLink(file, 'a'.repeat(26))).toBe(file);
  });
});

describe('new codes', () => {
  it('newPlayerCode draws again for a code that is taken', () => {
    expect(newPlayerCode(new Set(['000001']), seq(1, 2))).toBe('000002');
    for (let index = 0; index < 100; index += 1) expect(newPlayerCode(new Set())).toMatch(JOIN_CODE_PATTERN);
  });

  it('newLinkCode and newPlayerId match the protocol\'s patterns', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(newLinkCode()).toMatch(TABLE_CODE_PATTERN);
      expect(newPlayerId()).toMatch(PLAYER_ID_PATTERN);
    }
  });

  it('newLinkCode spells the bytes it is given in lowercase base32', () => {
    expect(newLinkCode(() => new Uint8Array(16))).toBe('a'.repeat(26));
    expect(newPlayerId(() => new Uint8Array(12).fill(255))).toBe(`${'7'.repeat(19)}q`);
  });
});
