import { parseGmMessage, parseLogEntry, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { ImageShare } from '../../../../src/app/online/gm/image/ImageShare.ts';
import { lootCardOf } from '../../../../src/app/online/gm/log/lootCard.ts';
import { TableLog } from '../../../../src/app/online/gm/log/TableLog.ts';
import type { LootDraw } from '../../../../src/app/loot/lootRoller';

const ANA = 'a'.repeat(20);
const ART = { hash: 'f'.repeat(64), size: 10, mime: 'image/png' };

interface Sent {
  readonly body: GmMessage;
  readonly to: string | undefined;
}

function log(): { log: TableLog; sent: Sent[] } {
  const sent: Sent[] = [];
  let id = 0;
  const made = new TableLog({
    send: (body, to) => void sent.push({ body, to }),
    clock: () => 1_700_000_000_000,
    now: () => 0,
    randomId: () => (id++).toString(16).padStart(24, '0'),
    nameOf: (player) => (player === ANA ? 'Ana' : null),
    setTimer: () => 1,
    clearTimer: () => undefined,
    changed: () => undefined,
  });
  made.welcome([{ id: ANA, name: 'Ana' }]);
  sent.length = 0;
  return { log: made, sent };
}

const DRAW: LootDraw = {
  id: 'draw-1', notePath: 'Secret/Loot/Sword.md', source: ['Treasure', 'Weapons'], name: 'Sword of [[Dawn]]', rarity: 'Rare', price: '120 gp',
  description: `A ${'very '.repeat(400)}old blade.`, properties: [{ label: 'Damage', value: '1d8' }, { label: '‮', value: 'x' }],
};

describe('what the GM showed or handed out', () => {
  it('an image goes to everyone by hash, its file stays with the GM, and the log lets it be served', () => {
    const { log: table, sent } = log();
    table.imageShown({ image: ART, width: 640, height: 480 }, 'Handouts/map.png');
    const message = sent[0]?.body;
    expect(sent[0]?.to).toBeUndefined();
    expect(message?.t === 'log-entry' ? message.entry : null).toMatchObject({ kind: 'image', who: 'gm', image: ART, width: 640, height: 480 });
    expect(JSON.stringify(message)).not.toContain('Handouts');
    expect(parseGmMessage(message)).toEqual(message);
    expect(table.artFile(ART.hash)).toBe('Handouts/map.png');
    const kept = new TableLog({ ...{ send: () => undefined, clock: () => 0, now: () => 0, randomId: () => '0'.repeat(24), nameOf: () => null, setTimer: () => 1, clearTimer: () => undefined, changed: () => undefined } }, JSON.parse(JSON.stringify(table.saved())));
    expect(kept.artFile(ART.hash)).toBe('Handouts/map.png');
    table.clear();
    expect(table.artFile(ART.hash)).toBeUndefined();
  });

  it('an item goes to everyone as the text of its card, bounded, never its note or source', () => {
    const { log: table, sent } = log();
    const item = lootCardOf(DRAW);
    if (item === null) throw new Error('no card');
    expect(item.description?.length).toBeLessThanOrEqual(1500);
    expect(item.description?.endsWith('…')).toBe(true);
    expect(item.properties).toEqual([{ label: 'Damage', value: '1d8' }]);
    table.lootHanded(item);
    const message = sent[0]?.body;
    expect(message?.t === 'log-entry' ? message.entry : null).toMatchObject({ kind: 'loot', who: 'gm', item: { name: 'Sword of [[Dawn]]', rarity: 'Rare', price: '120 gp' } });
    expect(JSON.stringify(message)).not.toMatch(/Secret|Treasure|notePath|source/);
    expect(parseGmMessage(message)).toEqual(message);
  });

  it('only the GM shows or hands out: a player\'s image or loot entry is no entry', () => {
    const base = { id: '0'.repeat(24), at: 1, who: ANA, name: 'Ana' };
    expect(parseLogEntry({ ...base, kind: 'image', image: ART, width: 1, height: 1 })).toBeNull();
    expect(parseLogEntry({ ...base, kind: 'loot', item: { name: 'Rope', properties: [] } })).toBeNull();
    expect(parseLogEntry({ ...base, who: 'gm', name: 'GM', kind: 'loot', item: { name: 'Rope', properties: 'many' } })).toBeNull();
  });

  it('a shown image is served while the log holds it, as it was sent, and refused once it is gone', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
    const hash = await sha256Hex(png);
    const sent: Sent[] = [];
    const logged = new Map<string, string>();
    const share = new ImageShare({
      send: (body, to) => void sent.push({ body, to }), now: () => 0, randomId: () => '1'.repeat(24), changed: () => undefined,
      logShown: (shown, path) => void (path !== null && logged.set(shown.image.hash, path)),
      loggedFile: (asked) => logged.get(asked),
      readImage: () => Promise.resolve(null),
    });
    expect(await share.show(() => Promise.resolve({ bytes: png, mime: 'image/png' }), 'Handouts/a.png')).toBe('shown');
    expect(logged.get(hash)).toBe('Handouts/a.png');
    share.dismiss();
    sent.length = 0;
    expect(share.receive(ANA, { t: 'asset-request', hash })).toBe(true);
    expect(sent.some(({ body }) => body.t === 'asset-chunk')).toBe(true);
    logged.clear();
    expect(share.receive(ANA, { t: 'asset-request', hash })).toBe(false);
  });
});
