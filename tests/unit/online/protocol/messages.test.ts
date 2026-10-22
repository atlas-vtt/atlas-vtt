import { describe, expect, it } from 'vitest';
import {
  ASSET_CHUNK_BYTES, CLOSE, MAX_CAMPAIGN_PLAYERS, FINAL_CLOSE_CODES, GATE_CLOSE_CODES, MAX_ASSET_BYTES, MAX_CURSOR_NUMBERS, MAX_LASER_SPAN_MS, MAX_LIVE_PATH, MAX_LIVE_TOKENS, MAX_BATCH_SENDS, MAX_PLAYER_NAME, MAX_PLAYERS, MAX_TOKEN_CONDITIONS, MAX_TOKENS, parseClientFrame, parseGmMessage, parsePlayerMessage, parseRelayFrame,
  playerName,
} from '../../../../src/app/online/protocol/index.ts';

const HASH = 'a'.repeat(64);

describe('client frames', () => {
  it('read a GM hello, a player hello with and without key, a send, a kick and an end', () => {
    expect(parseClientFrame('{"v":1,"t":"hello","role":"gm","secret":"0123456789abcdef"}')).toEqual({ v: 1, t: 'hello', role: 'gm', secret: '0123456789abcdef', level: 1 });
    expect(parseClientFrame('{"v":1,"t":"hello","role":"player","name":"Ana"}')).toEqual({ v: 1, t: 'hello', role: 'player', name: 'Ana' });
    expect(parseClientFrame('{"v":1,"t":"hello","role":"player","name":"Ana","key":"0123456789abcdef"}')).toEqual({ v: 1, t: 'hello', role: 'player', name: 'Ana', key: '0123456789abcdef' });
    expect(parseClientFrame(`{"v":1,"t":"kick","id":"${'a'.repeat(20)}"}`)).toEqual({ v: 1, t: 'kick', id: 'a'.repeat(20) });
    expect(parseClientFrame('{"v":1,"t":"send","to":"*","body":{"t":"x"}}')).toEqual({ v: 1, t: 'send', to: '*', body: { t: 'x' } });
    expect(parseClientFrame('{"v":1,"t":"end"}')).toEqual({ v: 1, t: 'end' });
    expect(parseClientFrame('{"v":1,"t":"sends","sends":[{"to":"*","body":{"t":"x"}},{"to":"p","body":null}]}')).toEqual({ v: 1, t: 'sends', sends: [{ to: '*', body: { t: 'x' } }, { to: 'p', body: null }] });
  });

  it('refuse other versions, short secrets, a send without body and non-JSON', () => {
    const tooMany = JSON.stringify({ v: 1, t: 'sends', sends: Array.from({ length: MAX_BATCH_SENDS + 1 }, () => ({ to: '*', body: 1 })) });
    for (const text of ['{"v":2,"t":"end"}', '{"v":1,"t":"hello","role":"player"}', '{"v":1,"t":"kick","id":"*"}', '{"v":1,"t":"hello","role":"gm","secret":"short"}', '{"v":1,"t":"send"}', '{"v":1,"t":"hello","role":"admin"}', 'not json', '[1]',
      '{"v":1,"t":"sends","sends":[]}', '{"v":1,"t":"sends","sends":[{"to":"*"}]}', '{"v":1,"t":"sends","sends":[{"body":1}]}', '{"v":1,"t":"sends","sends":{}}', tooMany]) {
      expect(parseClientFrame(text), text).toBeNull();
    }
  });
});

describe('the join gates\' frames', () => {
  const id = 'c'.repeat(20);

  it('read a player hello with a join code, with or without a key', () => {
    expect(parseClientFrame('{"v":1,"t":"hello","role":"player","name":"Ana","code":"483912"}')).toEqual({ v: 1, t: 'hello', role: 'player', name: 'Ana', code: '483912' });
    expect(parseClientFrame('{"v":1,"t":"hello","role":"player","name":"Ana","key":"0123456789abcdef","code":"000000"}')).toEqual({ v: 1, t: 'hello', role: 'player', name: 'Ana', key: '0123456789abcdef', code: '000000' });
  });

  it('refuse a hello whose code is not six digits', () => {
    for (const code of ['"48391"', '"4839123"', '"483 912"', '"48391a"', '"４８３９１２"', '483912', 'null', '""', '["483912"]']) {
      expect(parseClientFrame(`{"v":1,"t":"hello","role":"player","name":"Ana","code":${code}}`), code).toBeNull();
    }
  });

  it('read the GM\'s gate, with a code or none, and its admit and decline', () => {
    expect(parseClientFrame('{"v":1,"t":"gate","code":"483912","ask":true}')).toEqual({ v: 1, t: 'gate', code: '483912', ask: true });
    expect(parseClientFrame('{"v":1,"t":"gate","code":null,"ask":false}')).toEqual({ v: 1, t: 'gate', code: null, ask: false });
    expect(parseClientFrame(`{"v":1,"t":"admit","id":"${id}"}`)).toEqual({ v: 1, t: 'admit', id });
    expect(parseClientFrame(`{"v":1,"t":"decline","id":"${id}"}`)).toEqual({ v: 1, t: 'decline', id });
  });

  it('refuse a gate without its fields or with a code that is none, and an admit or decline without a player id', () => {
    for (const text of [
      '{"v":1,"t":"gate"}', '{"v":1,"t":"gate","code":"483912"}', '{"v":1,"t":"gate","ask":true}', '{"v":1,"t":"gate","code":"12345","ask":true}', '{"v":1,"t":"gate","code":483912,"ask":true}',
      '{"v":1,"t":"gate","code":null,"ask":"yes"}', '{"v":1,"t":"gate","code":"","ask":true}', '{"v":1,"t":"admit"}', '{"v":1,"t":"admit","id":"*"}', '{"v":1,"t":"decline","id":7}', `{"v":1,"t":"decline","id":"${id}x"}`,
    ]) expect(parseClientFrame(text), text).toBeNull();
  });

  it('read a knock, its end, a pause, the word to wait and the GM\'s welcome with who waits', () => {
    expect(parseRelayFrame(`{"v":1,"t":"knock","id":"${id}","name":" Mira\u202e "}`)).toEqual({ v: 1, t: 'knock', id, name: 'Mira' });
    expect(parseRelayFrame(`{"v":1,"t":"knock-gone","id":"${id}"}`)).toEqual({ v: 1, t: 'knock-gone', id });
    expect(parseRelayFrame(`{"v":1,"t":"knock-gone","id":"${id}","full":true}`)).toEqual({ v: 1, t: 'knock-gone', id, full: true });
    expect(parseRelayFrame('{"v":1,"t":"gate-paused","until":1760000000000}')).toEqual({ v: 1, t: 'gate-paused', until: 1760000000000 });
    expect(parseRelayFrame('{"v":1,"t":"waiting"}')).toEqual({ v: 1, t: 'waiting' });
    expect(parseRelayFrame(`{"v":1,"t":"welcome","role":"gm","players":[],"waiting":[{"id":"${id}","name":"Mira"}]}`)).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [], waiting: [{ id, name: 'Mira' }] });
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"gm","players":[],"waiting":[]}')).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [] });
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"gm","players":[],"batch":true}')).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [], batch: true });
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"gm","players":[],"batch":"yes"}')).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [] });
  });

  it('refuse a knock without a name or id, a knock-gone without an id, a pause without a time and a welcome whose waiting list is malformed', () => {
    for (const text of [
      `{"v":1,"t":"knock","id":"${id}"}`, `{"v":1,"t":"knock","id":"${id}","name":""}`, '{"v":1,"t":"knock","id":"x","name":"Mira"}', '{"v":1,"t":"knock-gone"}', '{"v":1,"t":"knock-gone","id":"x"}',
      '{"v":1,"t":"gate-paused"}', '{"v":1,"t":"gate-paused","until":"soon"}', '{"v":1,"t":"gate-paused","until":null}',
      '{"v":1,"t":"welcome","role":"gm","players":[],"waiting":[1]}', '{"v":1,"t":"welcome","role":"gm","players":[],"waiting":{}}', `{"v":1,"t":"welcome","role":"gm","waiting":[{"id":"${id}","name":"Mira"}]}`,
    ]) expect(parseRelayFrame(text), text).toBeNull();
  });
});

describe('player names', () => {
  it('lose controls, line breaks and direction overrides, and collapse white space', () => {
    expect(playerName(' Ana\u202e\u0000 the\r\n  Bold ')).toBe('Ana the Bold');
    expect(playerName('<b>Ana</b>')).toBe('<b>Ana</b>');
    expect(playerName('Zoë 🐉')).toBe('Zoë 🐉');
  });

  it('lose every mark that sets a direction, so a name cannot reorder the sentence it stands in', () => {
    for (const mark of ['\u061c', '\u200e', '\u200f', '\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069']) {
      expect(playerName(`Mi${mark}ra`), mark.codePointAt(0)?.toString(16)).toBe('Mi ra');
    }
    // Right-to-left letters are names like any other; the card isolates them.
    expect(playerName('דנה')).toBe('דנה');
    expect(playerName('مريم')).toBe('مريم');
  });

  it('lose what shows as nothing, and are no name when nothing that shows is left', () => {
    expect(playerName('Mi\u200bra\u2060\ufeff\u00ad\u180e')).toBe('Mira');
    expect(playerName('Mira\u3164wants to join')).toBe('Mira wants to join');
    for (const blank of ['\u3164', '\u115f\u1160', '\uffa0', '\u2800\u2800', '\u200b', '\u200d', '\u200c\u200d', '\u00a0', '\u3000', '\ufe0f', '\u0301']) {
      expect(playerName(blank), blank.codePointAt(0)?.toString(16)).toBeNull();
    }
    // The joiners that scripts and emoji are written with stay.
    expect(playerName('👩\u200d🚀')).toBe('👩\u200d🚀');
    expect(playerName('می\u200cخواهم')).toBe('می\u200cخواهم');
    expect(playerName('?')).toBe('?');
  });

  it('must be one to 32 characters', () => {
    for (const bad of ['', ' \t ', 'x'.repeat(33), 3, null]) expect(playerName(bad), String(bad)).toBeNull();
    expect(playerName('🐉'.repeat(32))).toBe('🐉'.repeat(32));
  });
});

describe('relay frames', () => {
  it('read a player welcome and a delivery stamped with its sender', () => {
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"player","id":"p","key":"k","gmOnline":true}')).toEqual({ v: 1, t: 'welcome', role: 'player', id: 'p', key: 'k', gmOnline: true });
    expect(parseRelayFrame('{"v":1,"t":"game","from":"p","body":1}')).toEqual({ v: 1, t: 'game', from: 'p', body: 1 });
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"gm","players":[1]}')).toBeNull();
    const id = 'b'.repeat(20);
    expect(parseRelayFrame(`{"v":1,"t":"welcome","role":"gm","players":[{"id":"${id}","name":"Ana"}]}`)).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [{ id, name: 'Ana' }] });
    expect(parseRelayFrame(`{"v":1,"t":"player-joined","id":"${id}","name":"Ana"}`)).toEqual({ v: 1, t: 'player-joined', id, name: 'Ana' });
    expect(parseRelayFrame(`{"v":1,"t":"player-joined","id":"${id}","name":""}`)).toBeNull();
  });

  it('read the word that the table closes because its account may no longer host, and that it may again', () => {
    expect(parseRelayFrame('{"v":1,"t":"access","closesAt":1760000000000}')).toEqual({ v: 1, t: 'access', closesAt: 1760000000000 });
    expect(parseRelayFrame('{"v":1,"t":"access","closesAt":null,"more":1}')).toEqual({ v: 1, t: 'access', closesAt: null });
    for (const text of ['{"v":1,"t":"access"}', '{"v":1,"t":"access","closesAt":"soon"}', '{"v":1,"t":"access","closesAt":1e999}']) expect(parseRelayFrame(text), text).toBeNull();
  });

  it('are final when the account may not host or started another table: no client tries again', () => {
    expect([CLOSE.noAccess, CLOSE.superseded]).toEqual([4015, 4016]);
    expect(FINAL_CLOSE_CODES).toEqual(expect.arrayContaining([CLOSE.noAccess, CLOSE.superseded]));
    expect(GATE_CLOSE_CODES).not.toEqual(expect.arrayContaining([CLOSE.noAccess, CLOSE.superseded]));
  });
});

describe('game messages', () => {
  it('read a scene, no scene, a chunk and a refusal', () => {
    const scene = { t: 'scene', scene: { id: 's', map: { hash: HASH, size: 10, mime: 'image/webp' }, lit: false } };
    expect(parseGmMessage(scene)).toEqual(scene);
    expect(parseGmMessage({ t: 'scene', scene: null })).toEqual({ t: 'scene', scene: null });
    expect(parseGmMessage({ t: 'asset-chunk', hash: HASH, index: 0, count: 1, data: 'AAAA' })).toEqual({ t: 'asset-chunk', hash: HASH, index: 0, count: 1, data: 'AAAA' });
    expect(parseGmMessage({ t: 'asset-refused', hash: HASH })).toEqual({ t: 'asset-refused', hash: HASH });
  });

  it('refuse a map of another type, a chunk past its count or larger than a chunk, and a bad hash', () => {
    expect(parseGmMessage({ t: 'scene', scene: { id: 's', map: { hash: HASH, size: 10, mime: 'text/html' }, lit: false } })).toBeNull();
    expect(parseGmMessage({ t: 'asset-chunk', hash: HASH, index: 1, count: 1, data: '' })).toBeNull();
    expect(parseGmMessage({ t: 'asset-chunk', hash: HASH, index: 0, count: 1, data: 'A'.repeat((ASSET_CHUNK_BYTES / 3) * 4 + 4) })).toBeNull();
    expect(parsePlayerMessage({ t: 'asset-request', hash: 'A'.repeat(64) })).toBeNull();
    expect(parsePlayerMessage({ t: 'asset-request', hash: HASH })).toEqual({ t: 'asset-request', hash: HASH });
    expect(parsePlayerMessage({ t: 'asset-request', hash: HASH, from: 0 })).toEqual({ t: 'asset-request', hash: HASH });
    expect(parsePlayerMessage({ t: 'asset-request', hash: HASH, from: 5 })).toEqual({ t: 'asset-request', hash: HASH, from: 5 });
    for (const from of [-1, 1.5, '3', null, Math.ceil(MAX_ASSET_BYTES / ASSET_CHUNK_BYTES)]) expect(parsePlayerMessage({ t: 'asset-request', hash: HASH, from })).toBeNull();
  });
});

describe('mine', () => {
  it('reads the ids of a player\'s own tokens and refuses anything else in the list', () => {
    const id = '0'.repeat(24);
    expect(parseGmMessage({ t: 'mine', scene: 's', tokens: [id] })).toEqual({ t: 'mine', scene: 's', tokens: [id] });
    expect(parseGmMessage({ t: 'mine', scene: 's', tokens: [id, 'gm-token'] })).toBeNull();
    expect(parseGmMessage({ t: 'mine', scene: 's', tokens: Array.from({ length: MAX_TOKENS + 1 }, () => id) })).toBeNull();
  });
});

describe('token lists', () => {
  const token = { id: '0'.repeat(24), x: 10, y: -20.5, size: 62, cells: 1.5, rotation: 90, art: { hash: HASH, size: 3, mime: 'image/webp' }, name: 'Bear', ring: { colour: '#aabbcc', size: 70 }, claim: 'open', badge: null, ui: null };
  const ui = {
    nameplate: true, downed: false,
    bars: [{ colour: '#dc2626', direction: 'drains', defeats: true, current: 4, max: 12 }, { colour: '#3b82f6', direction: 'static', defeats: false, current: 15, max: 15 }],
    conditions: [{ colour: '#22c55e', glyph: { kind: 'icon', icon: 'skull' }, value: null }, { colour: '#a855f7', glyph: { kind: 'text', text: 'F' }, value: 2 }],
  };

  it('read tokens with and without artwork, name, ring and claim', () => {
    const bare = { ...token, art: null, name: null, ring: null, claim: null };
    const taken = { ...token, claim: 'taken' };
    expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [token, bare, taken], cell: 70, snap: null })).toEqual({ t: 'tokens', scene: 's', tokens: [token, bare, taken], cell: 70, snap: null });
  });

  it('read a creature\'s bars, nameplate, conditions and instance number, and a list from an older companion without them', () => {
    const creature = { ...token, badge: 2, ui };
    expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [creature], cell: 70, snap: null })).toEqual({ t: 'tokens', scene: 's', tokens: [creature], cell: 70, snap: null });
    const older = Object.fromEntries(Object.entries(token).filter(([key]) => key !== 'badge' && key !== 'ui'));
    expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [older], cell: 70, snap: null })).toEqual({ t: 'tokens', scene: 's', tokens: [token], cell: 70, snap: null });
  });

  it('refuse a token whose UI is malformed', () => {
    const bar = ui.bars[0];
    const condition = ui.conditions[0];
    const bad = [
      { badge: 0 }, { badge: 1.5 }, { badge: '2' }, { ui: { ...ui, nameplate: 'yes' } }, { ui: { ...ui, downed: undefined } },
      { ui: { ...ui, bars: [bar, bar, bar] } }, { ui: { ...ui, bars: [{ ...bar, colour: 'red' }] } }, { ui: { ...ui, bars: [{ ...bar, max: 0 }] } },
      { ui: { ...ui, bars: [{ ...bar, current: Number.NaN }] } }, { ui: { ...ui, bars: [{ ...bar, direction: 'up' }] } }, { ui: { ...ui, bars: [{ ...bar, defeats: 1 }] } },
      { ui: { ...ui, conditions: [{ ...condition, glyph: { kind: 'icon', icon: '<svg>' } }] } }, { ui: { ...ui, conditions: [{ ...condition, glyph: { kind: 'text', text: '' } }] } },
      { ui: { ...ui, conditions: [{ ...condition, value: Number.POSITIVE_INFINITY }] } }, { ui: { ...ui, conditions: Array.from({ length: MAX_TOKEN_CONDITIONS + 1 }, () => condition) } },
      { ui: { ...ui, bars: undefined } },
    ];
    for (const change of bad) expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [{ ...token, ...change }], cell: 70, snap: null }), JSON.stringify(change)).toBeNull();
  });

  it('refuse a list without a cell size the tokens are sized by', () => {
    for (const cell of [undefined, 0, -70, Number.NaN, '70']) expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [token], cell, snap: null }), String(cell)).toBeNull();
  });

  it('read the grid tokens snap to, and refuse a list whose grid is malformed or missing', () => {
    const snap = { type: 'hex-vertical', size: 70, offsetX: -3, offsetY: 12.5 };
    expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [token], cell: 70, snap })).toEqual({ t: 'tokens', scene: 's', tokens: [token], cell: 70, snap });
    for (const bad of [undefined, { ...snap, type: 'iso' }, { ...snap, size: 0 }, { ...snap, offsetX: Number.POSITIVE_INFINITY }, { ...snap, offsetY: '1' }]) {
      expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [token], cell: 70, snap: bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('refuse the whole list for one token with a GM id, a place that is no number, a colour or artwork it may not have', () => {
    for (const bad of [{ id: 'gm-token-1' }, { x: Number.NaN }, { cells: 0 }, { cells: Number.POSITIVE_INFINITY }, { y: '1' }, { size: 0 }, { rotation: 400 }, { ring: { colour: 'red', size: 70 } }, { art: { hash: HASH, size: 3, mime: 'image/svg+xml' } }, { name: 'x'.repeat(201) }, { claim: 'mine' }, { claim: undefined }]) {
      expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: [token, { ...token, ...bad }], cell: 70, snap: null }), JSON.stringify(bad)).toBeNull();
    }
    expect(parseGmMessage({ t: 'tokens', scene: 's', tokens: Array.from({ length: MAX_TOKENS + 1 }, () => token), cell: 70, snap: null })).toBeNull();
  });
});

describe('moves', () => {
  const id = '0'.repeat(24);

  it.each(['move', 'drag'] as const)('read a player\'s %s with a finite place of a token players know', (t) => {
    expect(parsePlayerMessage({ t, scene: 's', id, x: 10.5, y: -3, extra: 1 })).toEqual({ t, scene: 's', id, x: 10.5, y: -3 });
    for (const bad of [{ id: 'gm-token' }, { x: Number.NaN }, { y: Number.POSITIVE_INFINITY }, { x: 1e7 }, { y: '4' }, { scene: '' }, { scene: 'x'.repeat(65) }]) {
      expect(parsePlayerMessage({ t, scene: 's', id, x: 1, y: 2, ...bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('read a player\'s drag cancel of a token players know, and nothing else', () => {
    expect(parsePlayerMessage({ t: 'drag-cancel', scene: 's', id, x: 1 })).toEqual({ t: 'drag-cancel', scene: 's', id });
    for (const bad of [{ id: 'gm-token' }, { id: undefined }, { scene: '' }, { scene: 'x'.repeat(65) }]) {
      expect(parsePlayerMessage({ t: 'drag-cancel', scene: 's', id, ...bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('read a refusal with the token\'s place or without one', () => {
    expect(parseGmMessage({ t: 'move-refused', scene: 's', id, x: 1, y: 2 })).toEqual({ t: 'move-refused', scene: 's', id, x: 1, y: 2 });
    expect(parseGmMessage({ t: 'move-refused', scene: 's', id, x: null, y: null })).toEqual({ t: 'move-refused', scene: 's', id, x: null, y: null });
    expect(parseGmMessage({ t: 'move-refused', scene: 's', id, x: 1, y: null })).toBeNull();
    expect(parseGmMessage({ t: 'move-refused', scene: 's', id, x: Number.NaN, y: 1 })).toBeNull();
  });
});

describe('claims', () => {
  const id = '0'.repeat(24);

  it('are no player message: only the GM gives tokens, so a claim or release from an older page reads as nothing', () => {
    expect(parsePlayerMessage({ t: 'claim', scene: 's', id })).toBeNull();
    expect(parsePlayerMessage({ t: 'release', scene: 's', id })).toBeNull();
  });
});

describe('fog and lighting', () => {
  const id = '0'.repeat(24);
  const lighting = { t: 'lighting', scene: 's', cellSize: 70, unitDistance: 5, walls: [{ p: [0, 0, 10, 10], door: 'closed' }], zones: [{ polygon: [0, 0, 5, 0, 0, 5], ambient: 0.5 }], senses: [{ id: 'darkvision' }] };
  const sight = {
    t: 'sight', scene: 's', lighting: { enabled: true, ambient: 0 }, lights: [{ id, x: 1, y: 2, emission: { bright: 1, dim: 2 } }],
    tokens: [{ id, x: 1, y: 2, size: 1, vision: { senses: [{ id: 'darkvision', range: 60 }], pending: true }, effects: ['blinded'] }], held: [{ id, x: 0, y: 0 }],
  };

  it('read fog, unreadable fog, walls, lights, tokens, explored memory and parts', () => {
    const fog = { t: 'fog', scene: 's', fog: [{ type: 'brush', erase: false, points: [1, 2, 3, 4], radius: 5 }, { type: 'rectangle', erase: true, x: 0, y: 0, width: 5, height: 5 }] };
    expect(parseGmMessage(fog)).toEqual(fog);
    expect(parseGmMessage({ t: 'fog', scene: 's', fog: null })).toEqual({ t: 'fog', scene: 's', fog: null });
    expect(parseGmMessage(lighting)).toEqual(lighting);
    expect(parseGmMessage(sight)).toEqual(sight);
    expect(parseGmMessage({ ...sight, blind: true })).toEqual({ ...sight, blind: true });
    expect(parseGmMessage({ t: 'explored', scene: 's', mask: { hash: HASH, size: 3, mime: 'image/png' } })).not.toBeNull();
    expect(parseGmMessage({ t: 'part', id: 'p', index: 1, count: 2, data: 'AAAA' })).toEqual({ t: 'part', id: 'p', index: 1, count: 2, data: 'AAAA' });
  });

  it('refuse a malformed operation, wall, vision or effect, explored memory that is no PNG and a part past its count', () => {
    expect(parseGmMessage({ t: 'fog', scene: 's', fog: [{ type: 'brush', erase: false, points: [1, 2, 3], radius: 5 }] })).toBeNull();
    expect(parseGmMessage({ t: 'fog', scene: 's', fog: [{ type: 'lasso', erase: 'no', points: [] }] })).toBeNull();
    expect(parseGmMessage({ ...lighting, walls: [{ p: [0, 0, 10] }] })).toBeNull();
    expect(parseGmMessage({ ...lighting, walls: [{ p: [0, 0, 10, 10], door: 'locked' }] })).toBeNull();
    expect(parseGmMessage({ ...sight, tokens: [{ ...sight.tokens[0], id: 'gm-token' }] })).toBeNull();
    expect(parseGmMessage({ ...sight, tokens: [{ ...sight.tokens[0], effects: ['petrified'] }] })).toBeNull();
    expect(parseGmMessage({ ...sight, tokens: [{ ...sight.tokens[0], vision: { senses: [{ id: 'x', range: -1 }] } }] })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene: 's', mask: { hash: HASH, size: 3, mime: 'image/webp' } })).toBeNull();
    expect(parseGmMessage({ t: 'part', id: 'p', index: 2, count: 2, data: 'AAAA' })).toBeNull();
  });
});

describe('rules', () => {
  const measurement = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [{ name: 'Near', maxSquares: 2 }], coneAngle: 90 };
  const rules = { t: 'rules', scene: 's1', grid: { type: 'square', size: 70, offsetX: 0, offsetY: 0 }, snap: true, measurement, accent: '#8a5cf5' };

  it('read the grid, snap, measurement and accent of a scene, with or without an accent', () => {
    expect(parseGmMessage(rules)).toEqual(rules);
    expect(parseGmMessage({ ...rules, accent: null })).toEqual({ ...rules, accent: null });
  });

  it('read whether everyone shows their cursor: only when the GM says so', () => {
    expect(parseGmMessage(rules)).not.toHaveProperty('cursors');
    expect(parseGmMessage({ ...rules, cursors: true })).toEqual({ ...rules, cursors: true });
    for (const cursors of [false, 'yes', 1, null]) expect(parseGmMessage({ ...rules, cursors }), String(cursors)).toBeNull();
  });

  it('refuse a missing grid, an unknown unit or rule, a bad distance, cone or band, and an accent that is no colour', () => {
    for (const bad of [
      { ...rules, grid: null }, { ...rules, snap: 'yes' }, { ...rules, accent: 'red' }, { ...rules, accent: '#8a5cf5; x' },
      { ...rules, measurement: { ...measurement, unitType: 'cubits' } }, { ...rules, measurement: { ...measurement, diagonalRule: 'manhattan' } },
      { ...rules, measurement: { ...measurement, unitDistance: 0 } }, { ...rules, measurement: { ...measurement, ruleDistance: Number.NaN } },
      { ...rules, measurement: { ...measurement, coneAngle: 400 } }, { ...rules, measurement: { ...measurement, rangeBands: [{ name: 3, maxSquares: 1 }] } },
      { ...rules, measurement: { ...measurement, rangeBands: Array.from({ length: 33 }, () => ({ name: 'x', maxSquares: 1 })) } },
    ]) expect(parseGmMessage(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('marks', () => {
  const PLAYER = 'a'.repeat(20);
  const laserState = { color: '#66ffa9', size: 16, at: [10, 20], pts: [1, 2, 3, 4], on: true };
  const measureState = { color: '#66ffa9', live: { shape: 'cone', a: [0, 0], b: [70, 0] }, kept: [{ shape: 'line', a: [1, 1], b: [2, 2] }] };
  const laser = { t: 'laser', scene: 's1', ...laserState };
  const measure = { t: 'measure', scene: 's1', ...measureState };

  it('read a player\'s laser and measurements', () => {
    expect(parsePlayerMessage(laser)).toEqual(laser);
    expect(parsePlayerMessage({ ...laser, at: null, pts: [], on: false })).toEqual({ ...laser, at: null, pts: [], on: false });
    expect(parsePlayerMessage(measure)).toEqual(measure);
    expect(parsePlayerMessage({ ...measure, live: null, kept: [] })).toEqual({ ...measure, live: null, kept: [] });
  });

  it('refuse odd or too many trail numbers, NaN, far points, unknown shapes, too many kept and colours that are not #rrggbb', () => {
    for (const bad of [
      { ...laser, pts: [1, 2, 3] }, { ...laser, pts: Array.from({ length: 34 }, () => 1) }, { ...laser, at: [Number.NaN, 0] }, { ...laser, at: [2e6, 0] },
      { ...laser, color: 'red' }, { ...laser, size: 0 }, { ...laser, on: 'yes' }, { ...laser, scene: '' },
      { ...measure, live: { shape: 'sphere', a: [0, 0], b: [1, 1] } }, { ...measure, kept: Array.from({ length: 21 }, () => measure.kept[0]) },
      { ...measure, kept: [{ shape: 'line', a: [0], b: [1, 1] }] }, { ...measure, color: '#fff' },
    ]) expect(parsePlayerMessage(bad), JSON.stringify(bad)).toBeNull();
  });

  it('read the time a laser\'s points cover, in whole milliseconds up to a second, and a laser that says none', () => {
    const marks = { t: 'marks', scene: 's1', lasers: [{ who: 'gm', ...laserState }], measures: [] };
    for (const span of [0, 33, MAX_LASER_SPAN_MS]) {
      expect(parsePlayerMessage({ ...laser, span })).toEqual({ ...laser, span });
      expect(parseGmMessage({ ...marks, lasers: [{ who: 'gm', ...laserState, span }, { who: PLAYER, ...laserState }] })).toEqual({ ...marks, lasers: [{ who: 'gm', ...laserState, span }, { who: PLAYER, ...laserState }] });
    }
    expect(parsePlayerMessage(laser)).not.toHaveProperty('span');
    for (const span of [-1, MAX_LASER_SPAN_MS + 1, 16.5, '33', null, Number.NaN, Number.POSITIVE_INFINITY, [33], true]) {
      expect(parsePlayerMessage({ ...laser, span }), String(span)).toBeNull();
      expect(parseGmMessage({ ...marks, lasers: [{ who: 'gm', ...laserState, span }] }), String(span)).toBeNull();
    }
  });

  it('read the time since a measurement\'s end was last told, like a laser\'s', () => {
    const marks = { t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', ...measureState }] };
    for (const span of [0, 33, MAX_LASER_SPAN_MS]) {
      expect(parsePlayerMessage({ ...measure, span })).toEqual({ ...measure, span });
      expect(parseGmMessage({ ...marks, measures: [{ who: 'gm', ...measureState, span }, { who: PLAYER, ...measureState }] })).toEqual({ ...marks, measures: [{ who: 'gm', ...measureState, span }, { who: PLAYER, ...measureState }] });
    }
    expect(parsePlayerMessage(measure)).not.toHaveProperty('span');
    for (const span of [-1, MAX_LASER_SPAN_MS + 1, 16.5, '33', null, Number.NaN, [33], true]) {
      expect(parsePlayerMessage({ ...measure, span }), String(span)).toBeNull();
      expect(parseGmMessage({ ...marks, measures: [{ who: 'gm', ...measureState, span }] }), String(span)).toBeNull();
    }
  });

  it('read the GM\'s marks, by the GM and players, and refuse unknown senders', () => {
    const marks = { t: 'marks', scene: 's1', lasers: [{ who: 'gm', ...laserState }, { who: PLAYER, ...laserState }], measures: [{ who: PLAYER, ...measureState }] };
    expect(parseGmMessage(marks)).toEqual(marks);
    expect(parseGmMessage({ ...marks, lasers: [{ who: 'someone', ...laserState }] })).toBeNull();
    expect(parseGmMessage({ ...marks, measures: [{ who: 'gm', ...measureState, kept: 'all' }] })).toBeNull();
  });
});

describe('cursors', () => {
  const PLAYER = 'a'.repeat(20);
  const cursor = { t: 'cursor', scene: 's1', at: [10, 20], pts: [1, 2, 3, 4] };
  const cursors = { t: 'marks', scene: 's1', lasers: [], measures: [], cursors: [{ who: 'gm', at: [5, 5], pts: [] }, { who: PLAYER, name: 'Ana', at: [10, 20], pts: [1, 2], span: 33 }] };

  it('read a player\'s cursor: where it is, or that it left, the places it passed and the time they cover', () => {
    expect(parsePlayerMessage(cursor)).toEqual(cursor);
    expect(parsePlayerMessage({ ...cursor, at: null, pts: [] })).toEqual({ ...cursor, at: null, pts: [] });
    for (const span of [0, 33, MAX_LASER_SPAN_MS]) expect(parsePlayerMessage({ ...cursor, span })).toEqual({ ...cursor, span });
    expect(parsePlayerMessage({ ...cursor, name: 'Mallory', who: 'gm', color: '#ff0000' })).toEqual(cursor);
  });

  it('refuse a cursor with odd or too many numbers, places that are none or far off, a bad span or no scene', () => {
    for (const bad of [
      { ...cursor, pts: [1, 2, 3] }, { ...cursor, pts: Array.from({ length: MAX_CURSOR_NUMBERS + 2 }, () => 1) }, { ...cursor, pts: [1, '2'] }, { ...cursor, pts: 'none' },
      { ...cursor, at: [Number.NaN, 0] }, { ...cursor, at: [2e6, 0] }, { ...cursor, at: [1] }, { t: 'cursor', scene: 's1', pts: [] },
      { ...cursor, span: -1 }, { ...cursor, span: MAX_LASER_SPAN_MS + 1 }, { ...cursor, span: 1.5 }, { ...cursor, span: '33' },
      { ...cursor, scene: '' }, { ...cursor, scene: 's'.repeat(65) },
    ]) expect(parsePlayerMessage(bad), JSON.stringify(bad).slice(0, 80)).toBeNull();
  });

  it('read everyone\'s cursors as the GM sends them on with the marks, each by whose it is, a player\'s with their name', () => {
    expect(parseGmMessage(cursors)).toEqual(cursors);
    const without = { t: 'marks', scene: 's1', lasers: [], measures: [] };
    expect(parseGmMessage(without)).toEqual(without);
    expect(parseGmMessage(without)).not.toHaveProperty('cursors');
    expect(parseGmMessage({ ...cursors, cursors: [] })).toEqual({ ...cursors, cursors: [] });
    expect(parseGmMessage({ ...cursors, cursors: Array.from({ length: MAX_PLAYERS + 1 }, () => cursors.cursors[0]) })).not.toBeNull();
  });

  it('refuse cursors of unknown senders, too many of them, a name that shows nothing or is too long, and any bad cursor among them', () => {
    const [gm, ana] = cursors.cursors;
    for (const bad of [
      { ...cursors, cursors: [{ ...gm, who: 'someone' }] }, { ...cursors, cursors: Array.from({ length: MAX_PLAYERS + 2 }, () => gm) }, { ...cursors, cursors: 'all' }, { ...cursors, cursors: null }, { t: 'cursors', scene: 's1', cursors: [] },
      { ...cursors, cursors: [{ ...ana, name: ' ' }] }, { ...cursors, cursors: [{ ...ana, name: 'n'.repeat(MAX_PLAYER_NAME + 1) }] }, { ...cursors, cursors: [{ ...ana, name: 7 }] },
      { ...cursors, cursors: [{ ...ana, name: ' Ana\u202e' }] }, { ...cursors, cursors: [gm, { ...ana, pts: [1] }] }, { ...cursors, cursors: [{ ...ana, span: 2000 }] }, { ...cursors, scene: '' },
    ]) expect(parseGmMessage(bad), JSON.stringify(bad).slice(0, 90)).toBeNull();
  });
});

describe('live places of a drag', () => {
  const id = 'a'.repeat(24);
  const live = { t: 'live', scene: 's1', at: 1234.5, tokens: [{ id, x: 10.5, y: -20 }, { id: 'b'.repeat(24), x: 1, y: 2, end: true }] };

  it('read the GM\'s live places', () => {
    expect(parseGmMessage(live)).toEqual(live);
    expect(parseGmMessage({ ...live, tokens: [] })).toEqual({ ...live, tokens: [] });
  });

  it('refuse a bad time, ids that are no alias, far or missing places, a false end and too many tokens', () => {
    for (const bad of [
      { ...live, at: -1 }, { ...live, at: Number.NaN }, { ...live, at: '1' }, { ...live, tokens: [{ id: 'gm-token', x: 1, y: 1 }] },
      { ...live, tokens: [{ id, x: 2e6, y: 1 }] }, { ...live, tokens: [{ id, x: 1 }] }, { ...live, tokens: [{ id, x: 1, y: 1, end: false }] },
      { ...live, tokens: Array.from({ length: MAX_LIVE_TOKENS + 1 }, () => ({ id, x: 1, y: 1 })) }, { ...live, tokens: {} }, { ...live, scene: 's'.repeat(65) },
    ]) expect(parseGmMessage(bad), JSON.stringify(bad).slice(0, 80)).toBeNull();
  });
});

describe('the ruler of a drag', () => {
  const id = 'a'.repeat(24);
  const place = { id, x: 105, y: 35 };
  const live = (path: unknown): unknown => ({ t: 'live', scene: 's1', at: 1, tokens: [{ ...place, path }] });

  it('is read with its place, and a place without one reads as before', () => {
    expect(parseGmMessage(live([[35, 35], [105, 35], [105.5, -70]]))).toEqual(live([[35, 35], [105, 35], [105.5, -70]]));
    expect(parseGmMessage({ t: 'live', scene: 's1', at: 1, tokens: [place] })).toEqual({ t: 'live', scene: 's1', at: 1, tokens: [place] });
  });

  it('refuses a path of fewer than two points, too many, or with a point that is no pair of coordinates', () => {
    for (const bad of [
      [], [[1, 1]], Array.from({ length: MAX_LIVE_PATH + 1 }, () => [1, 1]), [[1, 1], [1]], [[1, 1], [1, 2, 3]], [[1, 1], [2e6, 1]], [[1, 1], ['1', 1]], [[1, 1], { x: 1, y: 1 }], {}, null,
    ]) expect(parseGmMessage(live(bad)), JSON.stringify(bad).slice(0, 80)).toBeNull();
  });
});

describe('a campaign\'s players', () => {
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz234567';
  const seat = (n: number): { id: string; name: string; code: string } => ({ id: `${LETTERS[n % 32]}${LETTERS[Math.floor(n / 32)]}`.padEnd(20, 'a'), name: `Player ${n}`, code: String(100000 + n) });
  const frame = (players: unknown): string => JSON.stringify({ v: 1, t: 'players', players });

  it('are read from the GM\'s players frame, with an empty list too', () => {
    const players = [{ id: 'a'.repeat(20), name: ' Ana ', code: '482193' }, { id: 'b'.repeat(20), name: 'Ben', code: '000001' }];
    expect(parseClientFrame(frame(players))).toEqual({ v: 1, t: 'players', players: [{ id: 'a'.repeat(20), name: 'Ana', code: '482193' }, players[1]] });
    expect(parseClientFrame(frame([]))).toEqual({ v: 1, t: 'players', players: [] });
  });

  it('are refused with a bad id, a bad code, a bad name, a shared id or code, too many or no list', () => {
    const ok = { id: 'a'.repeat(20), name: 'Ana', code: '482193' };
    const other = { id: 'b'.repeat(20), name: 'Ben', code: '111111' };
    const tooMany = Array.from({ length: MAX_CAMPAIGN_PLAYERS + 1 }, (_, n) => seat(n));
    for (const players of [
      [{ ...ok, id: 'short' }], [{ ...ok, id: 'A'.repeat(20) }], [{ ...ok, code: '48219' }], [{ ...ok, code: 482193 }], [{ ...ok, name: '‮' }], [{ ...ok, name: 7 }], [{ id: ok.id, name: ok.name }],
      [ok, { ...other, id: ok.id }], [ok, { ...other, code: ok.code }], ['x'], null, {}, tooMany,
    ]) expect(parseClientFrame(frame(players)), JSON.stringify(players)).toBeNull();
    expect(parseClientFrame('{"v":1,"t":"players"}')).toBeNull();
  });

  it('are at most as many as the protocol allows, and that fits', () => {
    const full = Array.from({ length: MAX_CAMPAIGN_PLAYERS }, (_, n) => seat(n));
    expect(new Set(full.map((p) => p.id)).size).toBe(MAX_CAMPAIGN_PLAYERS);
    expect(parseClientFrame(frame(full))).toEqual({ v: 1, t: 'players', players: full });
  });

  it('keep a newcomer\'s flag on a player hello and drop any other value of it', () => {
    expect(parseClientFrame('{"v":1,"t":"hello","role":"player","name":"Ana","newcomer":true}')).toEqual({ v: 1, t: 'hello', role: 'player', name: 'Ana', newcomer: true });
    for (const value of ['false', '"yes"', '1', 'null']) {
      expect(parseClientFrame(`{"v":1,"t":"hello","role":"player","name":"Ana","newcomer":${value}}`), value).toEqual({ v: 1, t: 'hello', role: 'player', name: 'Ana' });
    }
  });
});
