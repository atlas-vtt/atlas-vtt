import { vi, describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { parseGmMessage, type GmMessage, type SharedPin } from '../../../../src/app/online/protocol/index.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { TableLog } from '../../../../src/app/online/gm/log/TableLog.ts';
import { FoundShare } from '../../../../src/app/online/gm/pins/FoundShare.ts';
import type { NotePin } from '../../../../src/app/types';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { questVault } from '../../../mocks/questVault';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent } from './shareHarness.ts';
import { settled } from './settled.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const NAMES: Readonly<Record<string, string>> = { [ANA]: 'Ana', [BEN]: 'Ben' };
const MAP = { width: 2000, height: 2000 };
const NOTE = 'Places/Keep.md';
const KEEP = [
  '---', 'secret: the GM\'s', '---',
  'The keep stands on a hill.',
  '## Cellar',
  'Barrels of old wine. %% the third one hides a key %%',
  '### Barrels',
  'They smell of oak.',
  '## Tower',
  'Wind howls up here.',
].join('\n');

const pin = (id: string, x: number, changes: Partial<NotePin> = {}): NotePin => ({ id, kind: 'pin', x, y: 400, notePath: NOTE, readable: true, ...changes });
const ofKind = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }>[] => sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : []));

/** Headings with their offsets, as Obsidian's metadata cache lists them. */
function headingsOf(content: string): { heading: string; level: number; position: { start: { line: number; offset: number }; end: { line: number; offset: number } } }[] {
  let offset = 0;
  return content.split('\n').flatMap((line, index) => {
    const start = offset;
    offset += line.length + 1;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    return match === null ? [] : [{ heading: match[2] ?? '', level: match[1]?.length ?? 1, position: { start: { line: index, offset: start }, end: { line: index, offset: start + line.length } } }];
  });
}

interface Table {
  readonly harness: ReturnType<typeof shareHarness>;
  readonly vault: ReturnType<typeof questVault>;
  readonly log: TableLog;
  readonly found: FoundShare;
  readonly sent: Sent[];
  shown(): readonly SharedPin[];
  open(from: string, alias: string): Promise<void>;
}

async function table(pins: Record<string, NotePin>, lit = false): Promise<Table> {
  const made = setUp(pins, lit);
  made.harness.share.start();
  await made.harness.advance(MAP_LAYER_INTERVAL_MS);
  return made;
}

function setUp(pins: Record<string, NotePin>, lit: boolean): Table {
  const wall: WallSegment = { id: 'w', kind: 'wall', type: 'wall', p1: { x: 700, y: 0 }, p2: { x: 700, y: 1000 } };
  const state = sceneState({
    lighting: { enabled: lit, ambient: 1 },
    objects: {
      ...sceneState().objects, pins,
      tokens: { hero: token('hero', { x: 400, y: 400, vision: { enabled: true } }) },
      walls: lit ? { w: wall } : {},
      fog: { cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 1100, y: 0, width: 400, height: 900 } },
    },
  });
  const harness = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
  harness.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: MAP });
  const vault = questVault({ [NOTE]: KEEP });
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => ({ headings: headingsOf(vault.files.get(file.path) ?? '') }));
  const sent: Sent[] = [];
  const log = new TableLog({
    send: (body, to) => void sent.push({ body, to }), clock: () => 1, now: () => 0, randomId: () => crypto.randomUUID().replace(/-/g, '').slice(0, 24),
    nameOf: (player) => NAMES[player] ?? null, setTimer: () => 0, clearTimer: () => undefined, changed: () => undefined,
  });
  log.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  const found = new FoundShare(log, {
    app: vault.app, send: (body, to) => void sent.push({ body, to }), now: () => 0, nameOf: (player) => NAMES[player] ?? null,
    readImage: () => Promise.resolve(null), layers: () => harness.share.layers,
  });
  harness.foundPin = (mapPath, pinId) => found.entryOf(mapPath, pinId);
  found.start();
  const scene = (): string => ofKind(harness.sent, 'scene').at(-1)?.scene?.id ?? '';
  const shown = (): readonly SharedPin[] => ofKind(harness.sent, 'pins').at(-1)?.pins ?? [];
  const open = async (from: string, alias: string): Promise<void> => {
    found.receive(from, { t: 'pin-found', scene: scene(), pin: alias });
    await settled();
    await harness.advance(MAP_LAYER_INTERVAL_MS);
  };
  return { harness, vault, log, found, sent, shown, open };
}

describe('readable pins players are sent', () => {
  it('send only readable pins of notes that committed fog does not cover, by alias and with nothing of the note', async () => {
    const { shown } = await table({
      open: pin('open', 300), fogged: pin('fogged', 1200), plain: pin('plain', 500, { readable: undefined }),
      gm: pin('gm', 600, { gmOnly: true }), scene: pin('scene', 650, { notePath: 'Scenes/Crypt.atlasmap' }),
    });
    expect(shown()).toHaveLength(1);
    const [listed] = shown();
    expect(listed).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), x: 300, y: 400, icon: 'pin', found: null });
    expect(JSON.stringify(shown())).not.toContain('Keep');
    expect(parseGmMessage(ofKindLast(shown()))).not.toBeNull();
  });

  it('send each pin with the face the GM sees: its icon, and the label of a numbered or lettered pin', async () => {
    const { shown } = await table({
      keep: pin('keep', 300, { icon: 'castle' }), room: pin('room', 400, { icon: 'number', label: '7' }), bare: pin('bare', 500, { icon: 'letter' }),
    });
    const faces = shown().map(({ icon, label }) => ({ icon, label }));
    expect(faces).toEqual(expect.arrayContaining([{ icon: 'castle', label: undefined }, { icon: 'number', label: '7' }, { icon: 'pin', label: undefined }]));
    expect(parseGmMessage(ofKindLast(shown()))).not.toBeNull();
  });

  it('in a lit scene send only the pins where the players see the map now, as door badges', async () => {
    const { shown } = await table({ near: pin('near', 500), behind: pin('behind', 900) }, true);
    expect(shown().map((listed) => listed.x)).toEqual([500]);
  });
});

describe('finding a readable pin', () => {
  it('logs the note once for everyone, by who found it, and opens the same entry for later finders', async () => {
    const { log, shown, open, sent } = await table({ keep: pin('keep', 300) });
    const alias = shown()[0]?.id ?? '';
    await open(ANA, alias);
    const entries = log.entries().filter((entry) => entry.kind === 'found');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'found', who: ANA, name: 'Ana', title: 'Keep' });
    expect(entries[0]?.kind === 'found' && entries[0].body).toContain('The keep stands on a hill.');
    expect(JSON.stringify(entries[0])).not.toContain('secret');
    expect(JSON.stringify(entries[0])).not.toContain('hides a key');
    expect(shown()[0]?.found).toBe(entries[0]?.id);
    await open(BEN, alias);
    expect(log.entries().filter((entry) => entry.kind === 'found')).toHaveLength(1);
    expect(sent.filter(({ body, to }) => body.t === 'log-entry' && to === BEN)).toHaveLength(1);
  });

  it('gives a heading only its section, to the next heading of its level', async () => {
    const { log, shown, open } = await table({ cellar: pin('cellar', 300, { notePath: `${NOTE}#Cellar` }) });
    await open(ANA, shown()[0]?.id ?? '');
    const entry = log.entries().find((logged) => logged.kind === 'found');
    expect(entry).toMatchObject({ title: 'Cellar' });
    const body = entry?.kind === 'found' ? entry.body : '';
    expect(body).toContain('Barrels of old wine.');
    expect(body).toContain('They smell of oak.');
    expect(body).not.toContain('Wind howls');
    expect(body).not.toContain('keep stands');
    expect(body).not.toContain('hides a key');
  });

  it('finds nothing for a pin the player does not see, an unknown player, or a pin that is not readable', async () => {
    const { log, open, found } = await table({ fogged: pin('fogged', 1200) });
    await open(ANA, '0'.repeat(24));
    found.receive('stranger', { t: 'pin-found', scene: 'x', pin: '0'.repeat(24) });
    await settled();
    expect(log.entries().some((entry) => entry.kind === 'found')).toBe(false);
  });

  it('follows the note as the GM edits it, and lets the pin be found again once the GM deletes its entry', async () => {
    const { log, shown, open, vault, harness } = await table({ keep: pin('keep', 300) });
    const alias = shown()[0]?.id ?? '';
    await open(ANA, alias);
    vault.write(NOTE, KEEP.replace('on a hill', 'on a cliff'));
    await settled();
    const entry = log.entries().find((logged) => logged.kind === 'found');
    expect(entry?.kind === 'found' && entry.body).toContain('on a cliff');
    log.remove(entry?.id ?? '');
    await harness.advance(1000);
    expect(shown()[0]?.found).toBeNull();
    await open(BEN, alias);
    expect(log.entries().find((logged) => logged.kind === 'found')).toMatchObject({ who: BEN });
  });
});

/** A `pins` message of the given pins, to check it reads as a client reads it. */
function ofKindLast(pins: readonly SharedPin[]): unknown {
  return JSON.parse(JSON.stringify({ t: 'pins', scene: 'scene', pins }));
}
