import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_PLAYERS, parseGmMessage, type AssetRef, type GmMessage, type PlayerSoundState } from '@/app/online/protocol/index.ts';
import { SOUND_SEND_MS, TableSoundShare, type ShareDirector, type SoundSharePorts } from '@/app/online/gm/sound/TableSoundShare.ts';
import type { CopyState } from '@/app/online/gm/assets/uploadQueue.ts';
import type { Mood, SoundInfo, SoundRecord, TableSound } from '@/app/sound/soundTypes';
import { EMPTY_MIX } from '@/app/soundDirector/soundMix';
import type { SoundSnapshot } from '@/app/soundDirector/soundSnapshot';
import { PlayersSeam } from '@/app/soundDirector/playersSeam';
import type { AudienceLine, PlayersSounds, TableClock } from '@/app/soundDirector/tableClock';

// `crypto.subtle` answers from another thread, in its own time, and under load later than `settle` waits: the same digest, within the task.
vi.mock('@/app/online/gm/assetServe.ts', async (original) => ({
  ...await original<typeof import('@/app/online/gm/assetServe.ts')>(),
  sha256Hex: async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => createHash('sha256').update(bytes).digest('hex'),
}));

/** A source's hash: what this device knows a sound by, and what must never leave it. */
const SOURCE_KEY = 's'.repeat(64);
const SECRET_NAME = 'The Dragon Wakes';

const record = (id: string, extra: Partial<SoundRecord> = {}): SoundRecord => ({ id, name: `${SECRET_NAME} ${id}`, kind: 'ambience', filePath: `Secret/${id}.mp3`, ...extra });
const infoOf = (id: string): SoundInfo => ({ key: `${SOURCE_KEY}${id}`, frames: 48_000 * 30, gainDb: -2 });

function tableWith(ids: readonly string[], revision = 1): TableSound {
  return { revision, silenced: false, silenceFade: { at: 0, ms: 0 }, music: null, outgoing: [], outgoingLayers: [], layers: ids.map((id) => ({ sound: infoOf(id), startAt: 1000, gainDb: -6, fade: { at: 1000, ms: 500 } })) };
}

class Rig {
  time = 0;
  private timerId = 0;
  private readonly due = new Map<number, { at: number; run: () => void }>();
  readonly sent: { body: GmMessage; to: string | undefined }[] = [];
  readonly times: number[] = [];
  readonly offered: { hash: string; handed: boolean }[] = [];
  refusing = false;
  copies = new Map<string, CopyState>();
  players: string[] = ['p1', 'p2', 'p3'];
  on = true;
  noted = 0;
  snapshot: SoundSnapshot = { mix: { ...EMPTY_MIX }, lifecycle: 'off', lastMix: null, previewing: null, output: null, audience: null, audienceDetail: null, waitingKeys: [], shelfRevision: 0, playersRevision: 0 };
  clock: TableClock | null = null;
  clockSteps: number[] = [];
  audience: AudienceLine | null = null;
  readonly records = new Map<string, SoundRecord>([['a', record('a')], ['b', { ...record('b'), licence: 'cc-by', credit: 'Kevin, CC BY 4.0' } as SoundRecord]]);
  moods: Mood[] = [];
  private readonly stateListeners = new Set<(state: TableSound) => void>();
  private readonly listeners = new Set<() => void>();
  private readonly seam: PlayersSeam;
  share: TableSoundShare;
  /** What this device keeps of what pages told it, as the plugin's local storage would across a reload. */
  heard: ReadonlyArray<readonly [string, PlayerSoundState]> = [];
  private readonly ports: SoundSharePorts;

  constructor(public sending = true) {
    const moods = { moods: () => this.moods, mood: (id: string) => this.moods.find((mood) => mood.id === id) ?? null };
    this.seam = new PlayersSeam({ moods: moods as never, readSceneSound: () => Promise.resolve({ mood: 'linked' }) }, () => undefined);
    const director = {
      get isOn() { return rig().on; },
      snapshot: () => this.snapshot,
      subscribe: (listener: () => void) => (this.listeners.add(listener), () => this.listeners.delete(listener)),
      onStateChanged: (listener: (state: TableSound) => void) => (this.stateListeners.add(listener), () => this.stateListeners.delete(listener)),
      useTableClock: (clock: TableClock | null) => void (this.clock = clock),
      tableClockStepped: (deltaMs: number) => void this.clockSteps.push(deltaMs),
      useAudience: (audience: AudienceLine | null) => void (this.audience = audience),
      players: this.seam,
      shelf: {
        growingOf: () => null,
        storedBytes: (key: string) => Promise.resolve({ byteLength: 8, read: () => Promise.resolve(new TextEncoder().encode(key.slice(-8))) }),
        infoOf: (given: SoundRecord) => infoOf(given.id),
        recordOfKey: (key: string) => this.records.get(key.slice(-1)) ?? null,
        recordsOf: (mood: Mood) => mood.layers.flatMap((layer) => this.records.get(layer.sound) ?? []),
        request: () => undefined,
      },
    } as unknown as ShareDirector;
    const rig = (): Rig => this;
    const ports: SoundSharePorts = {
      director,
      timers: { now: () => this.time, setTimer: (run, ms) => (this.due.set(++this.timerId, { at: this.time + ms, run }), this.timerId), clearTimer: (timer) => void this.due.delete(timer) },
      send: (body, to) => void this.sent.push({ body: JSON.parse(JSON.stringify(body)) as GmMessage, to }),
      sendTime: (t1) => (this.times.push(t1), true),
      connected: () => this.players,
      copyRef: (copy, _read, _use, handed) => {
        this.offered.push({ hash: copy.hash, handed });
        return Promise.resolve(this.refusing ? null : ({ ...copy, id: copy.hash.replace(/./, 'f') } satisfies AssetRef));
      },
      segmentsRef: () => Promise.resolve(null),
      copyState: (id) => this.copies.get(id) ?? { state: 'ready' },
      presentedPath: () => 'Scene.atlasmap',
      onPresentedChange: () => () => undefined,
      loadSending: () => this.sending,
      saveSending: (on) => void (this.sending = on),
      uploadsBegan: () => void this.noted++,
      recallHeard: () => this.heard,
      rememberHeard: (pages) => void (this.heard = pages),
    };
    this.ports = ports;
    this.share = new TableSoundShare(ports);
  }

  /** The plugin reloaded on this device: a new share on the same ports, the table and its pages as they were. */
  reload(): void {
    this.share.stop();
    this.share = new TableSoundShare(this.ports);
  }

  /** The director has another state. */
  play(table: TableSound): void {
    this.snapshot = { ...this.snapshot, mix: { ...this.snapshot.mix, table } };
    for (const listener of [...this.stateListeners]) listener(table);
    for (const listener of [...this.listeners]) listener();
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.due].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined) break;
      this.due.delete(next[0]);
      this.time = next[1].at;
      next[1].run();
      await settle();
    }
    this.time = end;
    await settle();
  }

  sounds(): GmMessage[] {
    return this.sent.map(({ body }) => body).filter((body) => body.t === 'sound');
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

describe('a table\'s sound for players', () => {
  let rig: Rig;

  afterEach(() => rig.share.stop());

  it('sends a state a page can read, with no name, path or source hash of anything in it', async () => {
    rig = new Rig();
    rig.share.start();
    rig.play(tableWith(['a', 'b']));
    await rig.advance(1000);
    const message = rig.sounds().at(-1);
    const text = JSON.stringify(message);
    expect(text).not.toContain(SECRET_NAME);
    expect(text).not.toContain('Secret/');
    expect(text).not.toContain(SOURCE_KEY);
    expect(parseGmMessage(JSON.parse(text))).not.toBeNull();
    expect(message?.t === 'sound' && message.state.layers.map((layer) => layer.sound.asset?.id === layer.sound.key)).toEqual([true, true]);
  });

  it('carries no credit line, even for a record an earlier build gave one', async () => {
    rig = new Rig();
    rig.share.start();
    rig.play(tableWith(['a', 'b']));
    await rig.advance(1000);
    const message = rig.sounds().at(-1);
    expect(message?.t === 'sound' && message.state.layers.map((layer) => 'credit' in layer.sound)).toEqual([false, false]);
    expect(JSON.stringify(message)).not.toContain('Kevin');
  });

  it('sends a moving fader about four times a second, and always its last place', async () => {
    rig = new Rig();
    rig.share.start();
    await rig.advance(1000);
    const before = rig.sounds().length;
    for (let move = 1; move <= 1200; move += 1) {
      rig.play(tableWith(['a'], move));
      await rig.advance(1000 / 120);
    }
    await rig.advance(SOUND_SEND_MS);
    const sent = rig.sounds().length - before;
    expect(sent).toBeLessThanOrEqual(10 * (1000 / SOUND_SEND_MS) + 1);
    const last = rig.sounds().at(-1);
    expect(last?.t === 'sound' && last.state.revision).toBe(1200);
  });

  it('gives a sound the store will not keep a key that says nothing, and silence in its place', async () => {
    rig = new Rig();
    rig.refusing = true;
    rig.share.start();
    rig.play(tableWith(['a']));
    await rig.advance(1000);
    const message = rig.sounds().at(-1);
    const sound = message?.t === 'sound' ? message.state.layers[0]?.sound : undefined;
    expect(sound?.asset).toBeUndefined();
    expect(sound?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(sound?.key).not.toContain('s'.repeat(8));
    expect(rig.share.copyOf(record('a'))).toEqual({ state: 'nowhere' });
  });

  it('tells the director when the first answer moves the clock past what a voice corrects, and not when answers settle', async () => {
    rig = new Rig();
    rig.share.start();
    await rig.advance(100);
    const first = rig.times.at(-1) as number;
    rig.share.heardTime(first, first - 180_000);
    expect(rig.clockSteps).toHaveLength(1);
    expect(rig.clockSteps[0]).toBeCloseTo(-180_000, -3);
    await rig.advance(100);
    const second = rig.times.at(-1) as number;
    rig.share.heardTime(second, second - 180_100);
    expect(rig.clockSteps).toHaveLength(1);
    rig.share.stop();
  });

  it('runs the director on the table\'s clock while it binds, and hands it back', async () => {
    rig = new Rig();
    rig.share.start();
    expect(rig.clock?.leadMs).toBe(1000);
    await rig.advance(100);
    expect(rig.times.length).toBeGreaterThan(0);
    rig.share.heardTime(rig.times[0] as number, 5_000_000);
    expect(rig.clock?.now()).toBeGreaterThan(4_000_000);
    rig.share.stop();
    expect(rig.clock).toBeNull();
    expect(rig.audience).toBeNull();
  });

  it('is silent when this device does not send, and tells players the sound goes when it stops', async () => {
    rig = new Rig(false);
    rig.share.start();
    rig.play(tableWith(['a']));
    await rig.advance(1000);
    expect(rig.sent).toEqual([]);
    expect(rig.times).toEqual([]);
    expect(rig.clock).toBeNull();
    rig.share.setSending(true);
    await rig.advance(1000);
    expect(rig.sounds().length).toBeGreaterThan(0);
    rig.share.setSending(false);
    await rig.advance(1000);
    const last = rig.sounds().at(-1);
    expect(last?.t === 'sound' && last.state.layers).toEqual([]);
    expect(last?.t === 'sound' && last.state.outgoingLayers.length).toBe(1);
    expect(rig.clock).toBeNull();
  });

  it('resends on a welcome and to who comes, also while nothing plays', async () => {
    rig = new Rig();
    rig.share.start();
    await rig.advance(1000);
    rig.share.resend('p9');
    expect(rig.sent.at(-1)?.to).toBe('p9');
    expect(rig.sent.at(-1)?.body.t).toBe('sound');
    rig.play(tableWith(['a']));
    await rig.advance(1000);
    rig.share.welcome();
    rig.share.resend();
    const again = rig.sent.at(-1);
    expect(again?.body.t === 'sound' && again.body.state.layers.length).toBe(1);
    expect(again?.to).toBeUndefined();
    expect(ALL_PLAYERS).toBe('*');
  });

  it('says who hears: as the pages say, and what is still going up', async () => {
    rig = new Rig();
    rig.share.start();
    rig.play(tableWith(['a']));
    await rig.advance(1000);
    rig.time = 2000;
    rig.share.receive('p1', { t: 'sound-state', state: 'playing', waiting: [] });
    rig.share.receive('p2', { t: 'sound-state', state: 'needs-tap', waiting: [] });
    expect(rig.share.receive('p3', { t: 'something-else' })).toBe(false);
    expect(rig.share.receive('p3', { t: 'sound-state', state: 'playing', waiting: ['a'.repeat(64)] })).toBe(true);
    expect(rig.audience?.line()).toBe('1 of 3 players hearing');
    const uploading = rig.sounds().at(-1);
    const id = uploading?.t === 'sound' ? uploading.state.layers[0]?.sound.key ?? '' : '';
    rig.copies.set(id, { state: 'uploading', share: 0.4 });
    expect(rig.audience?.line()).toBe('1 of 3 players hearing · 1 track still on its way');
    expect(rig.share.copyOf(record('a'))).toEqual({ state: 'uploading', share: 0.4 });
    rig.share.playerLeft('p1');
    rig.players = ['p2', 'p3'];
    expect(rig.audience?.line()).toBe('0 of 2 players hearing · 1 track still on its way');
    rig.share.storeChanged();
    await rig.advance(1000);
    expect(rig.noted).toBeGreaterThan(0);
  });

  it('offers what the shown scene links and the next mood ahead, and names them to players', async () => {
    rig = new Rig();
    rig.moods = [{ id: 'linked', name: SECRET_NAME, order: 1, fadeSeconds: 2, music: 'none', layers: [{ sound: 'a', levelDb: 0 }] }, { id: 'other', name: SECRET_NAME, order: 2, fadeSeconds: 2, music: 'none', layers: [{ sound: 'b', levelDb: 0 }] }];
    rig.share.start();
    await rig.advance(1000);
    const hint = rig.sent.map(({ body }) => body).find((body) => body.t === 'sound-prepare');
    expect(hint?.t === 'sound-prepare' && hint.assets.length).toBeGreaterThan(0);
    expect(JSON.stringify(hint)).not.toContain(SECRET_NAME);
    expect(rig.offered.some((offer) => offer.handed)).toBe(true);
    rig.offered.length = 0;
    (rig.share as PlayersSounds).prepare();
    await rig.advance(100);
    expect(rig.offered.every((offer) => !offer.handed)).toBe(true);
    expect(rig.offered.length).toBe(2);
    rig.offered.length = 0;
    (rig.share as PlayersSounds).prepare([record('a')]);
    await rig.advance(100);
    expect(rig.offered.length).toBe(1);
  });

  it('hands players a sound only staged ahead once it plays, so its progress reaches them', async () => {
    rig = new Rig();
    rig.moods = [{ id: 'linked', name: SECRET_NAME, order: 1, fadeSeconds: 2, music: 'none', layers: [{ sound: 'a', levelDb: 0 }] }, { id: 'other', name: SECRET_NAME, order: 2, fadeSeconds: 2, music: 'none', layers: [{ sound: 'b', levelDb: 0 }] }];
    rig.share.start();
    await rig.advance(1000);
    (rig.share as PlayersSounds).prepare([record('b')]);
    await rig.advance(100);
    expect(rig.offered.at(-1)).toMatchObject({ handed: false });
    rig.offered.length = 0;
    rig.play(tableWith(['b']));
    await rig.advance(SOUND_SEND_MS * 2);
    expect(rig.offered).toEqual([expect.objectContaining({ handed: true })]);
    expect(rig.sounds().at(-1)).toMatchObject({ state: { layers: [{ sound: { asset: { hash: rig.offered[0]?.hash } } }] } });
    rig.offered.length = 0;
    rig.play(tableWith(['b'], 2));
    await rig.advance(SOUND_SEND_MS * 2);
    expect(rig.offered).toEqual([]);
  });

  it('still knows who hears after the plugin reloads, though pages tell only what changed', async () => {
    rig = new Rig();
    rig.players = ['p1'];
    rig.share.start();
    rig.play(tableWith(['a']));
    await rig.advance(1000);
    rig.share.receive('p1', { t: 'sound-state', state: 'playing', waiting: [] });
    expect(rig.audience?.line()).toBe('1 of 1 player hearing');
    // A reload: the page keeps playing and tells nothing, since nothing changed on its side.
    rig.reload();
    rig.share.start();
    rig.play(tableWith(['a'], 2));
    await rig.advance(1000);
    expect(rig.audience?.line()).toBe('1 of 1 player hearing');
  });

  it('counts who hears again when a mood starts, though no page told anything new', async () => {
    rig = new Rig();
    rig.players = ['p1'];
    rig.share.start();
    rig.share.receive('p1', { t: 'sound-state', state: 'playing', waiting: [] });
    expect(rig.audience?.line()).toBeNull();
    const lines: (string | null)[] = [];
    rig.audience?.onChange(() => lines.push(rig.audience?.line() ?? null));
    rig.play(tableWith(['a']));
    await rig.advance(1000);
    expect(lines.at(-1)).toBe('1 of 1 player hearing');
  });
});
