import { describe, expect, it } from 'vitest';
import {
  MAX_DRAWN_DEPTH, MAX_DRAWN_NODES, MAX_DRAWN_TEXT, MAX_GM_SCREEN_MOODS, parseDeviceMessage, parseDrawnNodes, parseGmScreenMessage, type DeviceMessage, type GmScreenMessage, type KeysState,
} from '../../../../src/app/online/protocol/index.ts';
import type { RemoteState } from '../../../../src/app/soundRemote/remoteProtocol';

/** A state as Atlas's sound remote makes it: the Keys screen takes it as it is. */
const remote: RemoteState = {
  soundOn: true, mood: 'tavern', playing: true, stopped: false,
  music: { paused: false, muted: false, shuffle: true, repeat: 'one', levelDb: -6, track: 'The Drunken Dwarf' },
  nowPlaying: 'Tavern', levels: { masterDb: -3, musicDb: -6, ambienceDb: null },
  ranges: { channel: [-60, 6], strip: [-60, 6] },
  combat: { active: true, round: 3, combatants: 5, rolls: true },
  player: { open: true, presented: true, frozen: false, trueScale: false, hidden: true, handout: false },
  rolls: [{ id: 'r1', name: 'Attack', formula: '1d20+5', look: { sides: 20, count: 1, rule: '', rest: '+5', colour: '#aa3322' } }],
  rollsShown: true,
};
const keys: KeysState = { ...remote, player: { ...remote.player, online: false } };
const hash = 'a'.repeat(64);
const mood = { id: 'tavern', name: 'Tavern', tone: { light: '#b3261e', dark: '#e5534b' }, crest: 'beer-stein' };
const entry = { id: 'goblin', name: 'Goblin', portrait: hash, count: 3, turn: true, fight: true, player: false };
const combatant = { key: 's1-c1', name: 'Goblin', statblock: 'goblin', portrait: hash, ring: '#3a7d44', badge: 2, turn: true as const, hidden: true as const };
const fight = {
  round: 3,
  parts: [
    { k: 'group' as const, key: 'opponents', side: { id: 'opponents', name: 'Opponents', roll: 14, turn: true }, combatants: [combatant, { ...combatant, key: 's1-c2', badge: 3, turn: undefined, hidden: undefined, defeated: true as const }] },
    { k: 'round' as const, round: 4 },
    { k: 'group' as const, key: 'players', side: { id: 'players', name: 'Players', roll: null, turn: false }, combatants: [{ key: 's1-c3', name: 'Mira', statblock: null, portrait: null, ring: null, ally: true as const, sitsOut: true as const }] },
  ],
};
const plainFight = JSON.parse(JSON.stringify(fight)) as typeof fight;

const fromAtlas: GmScreenMessage[] = [
  { t: 'your-code', code: '123456', first: true },
  { t: 'keys', state: keys },
  { t: 'moods', moods: [mood, { ...mood, id: 'forest', crest: 'forest' }] },
  { t: 'mood-changes', moods: [{ ...mood, name: 'The Inn' }], removed: ['forest'] },
  { t: 'press-answer', id: 4, refused: null },
  { t: 'press-answer', id: 5, refused: 'no-player-window' },
  { t: 'statblocks', map: true, entries: [entry, { ...entry, id: 'mira', portrait: null, turn: false, fight: false, player: true }] },
  { t: 'statblocks', map: false, entries: [] },
  { t: 'statblocks', map: true, entries: [entry], fight: plainFight },
  { t: 'statblock', id: 'goblin', cut: false, drawing: 7, nodes: [{ e: 'span', dice: '1d20+4', roll: 0, k: ['+4'] }, { e: 'span', dice: '2d6', roll: 1, k: ['2d6'] }] },
  { t: 'statblock-roll-answer', id: 9, refused: null },
  { t: 'statblock-roll-answer', id: 10, refused: 'changed' },
  { t: 'statblock-roll-answer', id: 11, refused: null, result: { formula: '1d6+1+1d4[Bless]', total: 9, crit: 'high' } },
  { t: 'statblock-roll-answer', id: 12, refused: null, result: { total: -2 } },
  { t: 'statblock-roll-answer', id: 13, refused: 'too-fast' },
  { t: 'statblock', id: 'goblin', cut: false, nodes: [{ e: 'div', c: ['atlas-sb-heading'], k: ['Goblin', { e: 'span', dice: '1d20+4', k: ['+4'] }, { e: 'img', src: hash }] }, { e: 'td', colspan: 2, k: ['x'] }] },
  { t: 'statblock-gone', id: 'goblin', reason: 'missing' },
  { t: 'portrait', hash, mime: 'image/webp', data: 'UklGRg==' },
];
const fromDevice: DeviceMessage[] = [
  { t: 'press', id: 1, command: { type: 'level', channel: 'music', db: -12 } },
  { t: 'statblock-view', id: 'goblin' },
  { t: 'statblock-view', id: null },
  { t: 'portrait-ask', hash },
  { t: 'statblock-roll', id: 9, statblock: 'goblin', drawing: 7, roll: 1 },
];

describe('the GM screen\'s messages', () => {
  it('read every message each way as it was sent', () => {
    for (const message of fromAtlas) expect(parseGmScreenMessage(JSON.parse(JSON.stringify(message))), message.t).toEqual(message);
    for (const message of fromDevice) expect(parseDeviceMessage(JSON.parse(JSON.stringify(message))), message.t).toEqual(message);
  });

  it('read a state without the online table\'s flag, as an older Atlas sends it, and leave out a flag that is no switch', () => {
    const older = remote.player;
    const read = (player: unknown): unknown => (parseGmScreenMessage({ t: 'keys', state: { ...keys, player } }) as Extract<GmScreenMessage, { t: 'keys' }> | null)?.state.player;
    expect(read(older)).toEqual(older);
    expect(read({ ...older, online: 'yes' })).toEqual(older);
    expect(read({ ...older, online: true })).toEqual({ ...older, online: true });
  });

  it('read a list and a drawing of an older Atlas, and leave out a fight or numbers that are malformed while the rest reads', () => {
    const list = { t: 'statblocks', map: true, entries: [entry] };
    expect(parseGmScreenMessage(list)).toEqual(list);
    for (const bad of [{ ...plainFight, round: -1 }, { ...plainFight, parts: [{ k: 'group', key: 'order', combatants: [{ ...combatant, ring: 'green' }] }] },
      { ...plainFight, parts: [{ k: 'group', key: 'order', combatants: [combatant, combatant] }] }, { ...plainFight, parts: [{ k: 'side' }] },
      { ...plainFight, parts: [{ k: 'group', key: 'order', combatants: Array.from({ length: 201 }, (_, index) => ({ ...combatant, key: `c${index}` })) }] }]) {
      expect(parseGmScreenMessage({ ...list, fight: bad }), JSON.stringify(bad).slice(0, 80)).toEqual(list);
    }
    // A badge that is no number, and a flag that is not true, are left out of the row
    const odd = { ...plainFight, parts: [{ k: 'group', key: 'order', combatants: [{ ...combatant, badge: 0, turn: 'yes', hidden: 1 }] }] };
    expect((parseGmScreenMessage({ ...list, fight: odd }) as Extract<GmScreenMessage, { t: 'statblocks' }>).fight?.parts[0]).toEqual({ k: 'group', key: 'order', combatants: [{ key: 's1-c1', name: 'Goblin', statblock: 'goblin', portrait: hash, ring: '#3a7d44' }] });
    const drawn = { t: 'statblock', id: 'goblin', cut: false, nodes: [{ e: 'span', dice: '1d20', k: ['x'] }] };
    expect(parseGmScreenMessage(drawn)).toEqual(drawn);
    expect(parseGmScreenMessage({ ...drawn, drawing: 0, nodes: [{ e: 'span', roll: 0, k: ['x'] }, { e: 'span', dice: '1d6', roll: -1 }] })).toEqual({ ...drawn, nodes: [{ e: 'span', k: ['x'] }, { e: 'span', dice: '1d6' }] });
  });

  it('keep an answer whose result is malformed or stands beside a refusal, without that result, and a fight row\'s turn colour only where it is one', () => {
    const answer = (result: unknown, refused: string | null = null): unknown => parseGmScreenMessage({ t: 'statblock-roll-answer', id: 3, refused, result });
    expect(answer({ total: '9' })).toEqual({ t: 'statblock-roll-answer', id: 3, refused: null });
    expect(answer({ total: 1e12 })).toEqual({ t: 'statblock-roll-answer', id: 3, refused: null });
    expect(answer({ total: 5, formula: `${'1'.repeat(400)}`, crit: 'max' })).toEqual({ t: 'statblock-roll-answer', id: 3, refused: null, result: { total: 5 } });
    expect(answer({ total: 5 }, 'not-rolled')).toEqual({ t: 'statblock-roll-answer', id: 3, refused: 'not-rolled' });

    const row = (turnColour: unknown): unknown => (parseGmScreenMessage({ t: 'statblocks', map: true, entries: [], fight: { round: 1, parts: [{ k: 'group', key: 'order', combatants: [{ key: 'c1', name: 'Ogre', statblock: null, portrait: null, ring: null, turnColour }] }] } }) as { fight?: { parts: { combatants: unknown[] }[] } }).fight?.parts[0]?.combatants[0];
    expect(row('#b3261e')).toMatchObject({ turnColour: '#b3261e' });
    expect(row(null)).toMatchObject({ turnColour: null });
    expect(row('red')).not.toHaveProperty('turnColour');
  });

  it('read a message only from the end that sends it', () => {
    for (const message of fromAtlas) expect(parseDeviceMessage(message), message.t).toBeNull();
    for (const message of fromDevice) expect(parseGmScreenMessage(message), message.t).toBeNull();
  });

  it('refuse wrong types, missing fields and too much, without throwing', () => {
    const state = { ...keys } as Record<string, unknown>;
    const refused: unknown[] = [
      null, 'keys', [], { t: 'keys' }, { t: 'keys', state: { ...state, soundOn: 'yes' } }, { t: 'keys', state: { ...state, levels: { masterDb: Infinity, musicDb: null, ambienceDb: null } } },
      { t: 'keys', state: { ...state, music: { ...keys.music, repeat: 'twice' } } }, { t: 'keys', state: { ...state, ranges: { channel: [6, -60], strip: [-60, 6] } } },
      { t: 'keys', state: { ...state, rolls: Array.from({ length: 300 }, () => keys.rolls[0]) } }, { t: 'keys', state: { ...state, player: { ...keys.player, open: 1 } } },
      { t: 'keys', state: { ...state, mood: 'm'.repeat(201) } }, { t: 'keys', state: { ...state, rolls: [{ ...keys.rolls[0], look: { ...keys.rolls[0]?.look, colour: 'red' } }] } },
      { t: 'moods', moods: [mood, mood] }, { t: 'moods', moods: [{ ...mood, crest: '<svg>' }] }, { t: 'moods', moods: [{ ...mood, tone: { light: 'red', dark: '#000000' } }] },
      { t: 'moods', moods: Array.from({ length: MAX_GM_SCREEN_MOODS + 1 }, (_, index) => ({ ...mood, id: `m${index}` })) }, { t: 'mood-changes', moods: [], removed: [7] },
      { t: 'press-answer', id: -1, refused: null }, { t: 'press-answer', id: 1, refused: 'No Scene' }, { t: 'press-answer', id: 1 },
      { t: 'statblocks', map: true, entries: [entry, entry] }, { t: 'statblocks', map: true, entries: [{ ...entry, id: 'Notes/Goblin.md' }] }, { t: 'statblocks', map: 'yes', entries: [] },
      { t: 'statblocks', map: true, entries: [{ ...entry, portrait: 'abc' }] }, { t: 'statblock', id: 'goblin', cut: false }, { t: 'statblock', id: 'goblin', nodes: [7], cut: false },
      { t: 'statblock-gone', id: 'goblin', reason: 'It is gone' }, { t: 'portrait', hash, mime: 'image/svg+xml', data: 'UklGRg==' }, { t: 'portrait', hash, mime: 'image/png', data: 'A'.repeat(400_000) },
      { t: 'your-code', code: '12345', first: true }, { t: 'shown-image' }, { t: 'unknown' },
    ];
    for (const value of refused) {
      expect(() => parseGmScreenMessage(value)).not.toThrow();
      expect(parseGmScreenMessage(value), JSON.stringify(value).slice(0, 120)).toBeNull();
    }
    for (const value of [{ t: 'press', id: 1 }, { t: 'press', id: 1, command: { type: 'stop all' } }, { t: 'press', id: 1.5, command: { type: 'pause' } }, { t: 'statblock-view' }, { t: 'portrait-ask', hash: 'A'.repeat(64) }, { t: 'move' },
      { t: 'statblock-roll', id: 1, statblock: 'goblin', drawing: 1, roll: '1d20' }, { t: 'statblock-roll', id: 1, statblock: 'goblin', drawing: 0, roll: 0 },
      { t: 'statblock-roll', id: 1, statblock: 'Notes/Goblin.md', drawing: 1, roll: 0 }, { t: 'statblock-roll', id: 1, statblock: 'goblin', formula: '1d20' }]) {
      expect(parseDeviceMessage(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe('a drawn statblock', () => {
  it('leaves out every element, attribute and class off its lists, with what they hold', () => {
    const nodes = parseDrawnNodes([
      { e: 'script', k: ['alert(1)'] }, { e: 'iframe', src: 'https://evil.example' }, { e: 'a', href: 'javascript:alert(1)', k: ['link'] }, { e: 'style', k: ['* { display: none }'] },
      { e: 'p', c: ['atlas-sb-item', 'atlas-sidekick-tab', 'not ok', 'x"><script>', ''], onclick: 'alert(1)', style: 'color: red', href: '#', k: ['text', { e: 'object', k: ['inside'] }] },
      { e: 'img', src: 'javascript:alert(1)' }, { e: 'img' }, { e: 'br', k: ['never read'] }, { e: 'td', colspan: 999, rowspan: 2, dice: 'x'.repeat(65) },
    ]);
    expect(nodes).toEqual([{ e: 'p', c: ['atlas-sb-item'], k: ['text'] }, { e: 'br' }, { e: 'td', rowspan: 2 }]);
  });

  it('is refused whole where it holds more elements, nesting or text than a statblock may', () => {
    const nested = (depth: number): unknown => (depth === 0 ? 'deep' : { e: 'div', k: [nested(depth - 1)] });
    expect(parseDrawnNodes([nested(MAX_DRAWN_DEPTH - 1)])).not.toBeNull();
    expect(parseDrawnNodes([nested(MAX_DRAWN_DEPTH)])).toBeNull();
    expect(parseDrawnNodes([nested(5000)])).toBeNull();
    expect(parseDrawnNodes(Array.from({ length: MAX_DRAWN_NODES }, () => 'x'))).not.toBeNull();
    expect(parseDrawnNodes(Array.from({ length: MAX_DRAWN_NODES + 1 }, () => 'x'))).toBeNull();
    expect(parseDrawnNodes(['x'.repeat(MAX_DRAWN_TEXT)])).not.toBeNull();
    expect(parseDrawnNodes(['x'.repeat(MAX_DRAWN_TEXT), 'x'])).toBeNull();
    for (const value of [null, 'text', {}, [null], [7], [['nested']], [{ e: 7 }], [{ e: 'div', k: 'text' }]]) expect(parseDrawnNodes(value), JSON.stringify(value)).toBeNull();
  });
});
