import { describe, expect, it } from 'vitest';
import { OggOpusWriter } from '@/app/sound/codec/oggOpusWriter';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';
import { SoundPlayer } from '@/app/sound/engine/soundPlayer';
import { driftAction } from '@/app/sound/engine/soundVoice';
import type { WindowDecode } from '@/app/sound/engine/windowDecoder';
import type { LayerPlay, MusicPlay, SoundBytes, SoundInfo, TableSound } from '@/app/sound/soundTypes';
import { fakeBuffer, FakeSoundContext } from '../../helpers/fakeSoundContext';

const RATE = 48000;

function sound(key: string, seconds = 10): SoundInfo {
  return { key, frames: seconds * RATE, gainDb: 0 };
}

function layer(info: SoundInfo, extra: Partial<LayerPlay> = {}): LayerPlay {
  return { sound: info, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

function music(tracks: SoundInfo[], extra: Partial<MusicPlay> = {}): MusicPlay {
  return { tracks, seed: 1, shuffle: false, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

function table(extra: Partial<TableSound> = {}): TableSound {
  return { revision: 1, silenced: false, silenceFade: { at: 0, ms: 0 }, music: null, outgoing: [], layers: [], outgoingLayers: [], ...extra };
}

const emptyBytes: SoundBytes = { byteLength: 4, read: () => Promise.resolve(new Uint8Array(4)) };

interface Rig {
  context: FakeSoundContext;
  player: SoundPlayer;
  /** Table time and context time move together, unless `tableOffset` says otherwise. */
  advance(seconds: number): Promise<void>;
  tableOffset: { ms: number };
  errors: string[];
}

function rig(resolve: (key: string) => SoundBytes | Promise<SoundBytes> = () => emptyBytes, windowDecode?: WindowDecode): Rig {
  const context = new FakeSoundContext();
  const tableOffset = { ms: 0 };
  const errors: string[] = [];
  const player = new SoundPlayer({
    context,
    tableNow: () => context.currentTime * 1000 + tableOffset.ms,
    resolve,
    onSoundError: (key) => errors.push(key),
    ...(windowDecode ? { windowDecode: () => windowDecode } : {}),
  });
  return {
    context,
    player,
    tableOffset,
    errors,
    advance: async (seconds) => {
      context.currentTime += seconds;
      player.tick();
      await player.settled();
    },
  };
}

describe('following the state', () => {
  it('starts a layer at the right place, past a fresh context\'s margin', async () => {
    const { context, player } = rig();
    player.setState(table({ layers: [layer(sound('rain'), { startAt: -2000 })] }));
    await player.settled();
    const [source] = context.playing();
    expect(context.playing()).toHaveLength(1);
    expect(source?.loop).toBe(true);
    expect(source?.loopEnd).toBe(10);
    expect(source?.started?.when).toBeGreaterThan(0);
    // It plays what the table says at the moment it starts: 2 s in, plus the margin.
    expect((source?.started?.offset ?? 0) - (source?.started?.when ?? 0)).toBeCloseTo(2, 3);
  });

  it('keeps a layer playing through a state that still holds it, and only ramps', async () => {
    const { context, player, advance } = rig();
    const rain = layer(sound('rain'));
    player.setState(table({ layers: [rain] }));
    await player.settled();
    const source = context.playing()[0];
    await advance(1);
    player.setState(table({ revision: 2, layers: [{ ...rain, gainDb: -6, fade: { at: 1000, ms: 1000 } }, layer(sound('wind'), { startAt: 1000, fade: { at: 1000, ms: 1000 } })] }));
    await player.settled();
    expect(context.playing()).toContain(source);
    expect(source?.stoppedAt).toBeNull();
    expect(context.playing()).toHaveLength(2);
  });

  it('does not touch a shared layer whose level stays', async () => {
    const { context, player } = rig();
    const rain = layer(sound('rain'));
    player.setState(table({ layers: [rain] }));
    await player.settled();
    const events = context.gains.map((gain) => gain.events.length);
    player.setState(table({ revision: 2, layers: [{ ...rain, fade: { at: 5000, ms: 3000 } }] }));
    expect(context.gains.map((gain) => gain.events.length)).toEqual(events);
  });

  it('is idempotent: the same state again changes nothing', async () => {
    const { context, player } = rig();
    const state = table({ layers: [layer(sound('rain'))], music: music([sound('song')]) });
    player.setState(state);
    await player.settled();
    const sources = context.sources.length;
    const events = context.gains.map((gain) => gain.events.length);
    player.setState(state);
    await player.settled();
    expect(context.sources.length).toBe(sources);
    expect(context.gains.map((gain) => gain.events.length)).toEqual(events);
  });

  it('lets go of what the state no longer holds', async () => {
    const { context, player, advance } = rig();
    player.setState(table({ layers: [layer(sound('rain'))] }));
    await player.settled();
    const source = context.playing()[0];
    player.setState(table({ revision: 2 }));
    await advance(1);
    expect(source?.stoppedAt).not.toBeNull();
    expect(context.playing()).toHaveLength(0);
  });

  it('decodes a sound two voices share once', async () => {
    const { context, player, advance } = rig();
    const rain = sound('rain');
    player.setState(table({ layers: [layer(rain)] }));
    await advance(1);
    player.setState(table({ layers: [layer(rain), layer(rain, { startAt: 1000 })] }));
    await player.settled();
    expect(context.playing()).toHaveLength(2);
    expect(context.decodeCalls).toBe(1);
  });

  it('moves on to the next track of a list, on its exact frame', async () => {
    const { context, player, advance } = rig();
    player.setState(table({ music: music([sound('a', 30), sound('b', 30)]) }));
    await player.settled();
    await advance(15);
    // Within 20 s of the change, the next track is already on the clock.
    const next = context.sources.at(-1);
    expect(context.sources).toHaveLength(2);
    expect(next?.started?.when).toBe(30);
    expect(next?.started?.offset).toBe(0);
    expect(next?.loop).toBe(false);
    expect(context.sources[0]?.stoppedAt).toBe(30);
  });
});

describe('Silence', () => {
  it('stops everything once the fade is over, and comes back at the right place', async () => {
    const { context, player, advance } = rig();
    const rain = layer(sound('rain'));
    player.setState(table({ layers: [rain] }));
    await player.settled();
    await advance(1);
    player.setState(table({ revision: 2, layers: [rain], silenced: true, silenceFade: { at: 1000, ms: 500 } }));
    await advance(1);
    await advance(0.2);
    expect(context.playing()).toHaveLength(0);
    await advance(5);
    player.setState(table({ revision: 3, layers: [rain], silenced: false, silenceFade: { at: 7200, ms: 500 } }));
    await player.settled();
    const back = context.playing()[0];
    expect(back).toBeDefined();
    expect((back?.started?.offset ?? 0) % 10).toBeCloseTo(((back?.started?.when ?? 0) % 10), 3);
  });
});

describe('late bytes', () => {
  it('holds up only the sound they belong to, then joins where the table is', async () => {
    let release: (bytes: SoundBytes) => void = () => undefined;
    const late = new Promise<SoundBytes>((resolve) => {
      release = resolve;
    });
    const { context, player, advance } = rig((key) => (key === 'late' ? late : emptyBytes));
    player.setState(table({ layers: [layer(sound('late')), layer(sound('here'))] }));
    context.currentTime += 0;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(context.playing()).toHaveLength(1);
    expect(player.waitingKeys()).toEqual(['late']);
    context.currentTime = 3;
    release(emptyBytes);
    await advance(0);
    expect(context.playing()).toHaveLength(2);
    const joined = context.playing()[1];
    expect(joined?.started?.when).toBeGreaterThan(3);
    expect(joined?.started?.offset).toBeCloseTo(joined?.started?.when ?? 0, 3);
    expect(player.waitingKeys()).toEqual([]);
  });

  it('reports bytes it cannot have, tries again, and hears them when they come', async () => {
    let refuse = true;
    const { context, player, advance, errors } = rig(() => {
      if (refuse) throw new Error('not stored yet');
      return emptyBytes;
    });
    player.setState(table({ layers: [layer(sound('rain'))] }));
    await player.settled();
    expect(errors).toEqual(['rain']);
    expect(context.playing()).toHaveLength(0);
    await advance(1);
    expect(errors).toEqual(['rain']);
    refuse = false;
    await advance(5);
    expect(context.playing()).toHaveLength(1);
  });
});

describe('drift', () => {
  it('has three answers by size, none of them a change of speed', () => {
    expect(driftAction(49)).toBe('leave');
    expect(driftAction(-49)).toBe('leave');
    expect(driftAction(50)).toBe('restart');
    expect(driftAction(-2000)).toBe('restart');
    expect(driftAction(2001)).toBe('seek');
  });

  async function settled(): Promise<Rig> {
    const made = rig();
    made.player.setState(table({ layers: [layer(sound('rain', 40))] }));
    await made.player.settled();
    return made;
  }

  async function ticks(made: Rig, count: number): Promise<void> {
    for (let i = 0; i < count; i++) await made.advance(0.25);
  }

  it('leaves a small error alone', async () => {
    const made = await settled();
    made.tableOffset.ms = 40;
    await ticks(made, 20);
    expect(made.context.sources).toHaveLength(1);
  });

  it('restarts at the next loop point, not at once, for a middling error', async () => {
    const made = await settled();
    const first = made.context.sources[0];
    made.tableOffset.ms = 300;
    await ticks(made, 6);
    expect(made.context.sources).toHaveLength(2);
    // The first runs to the wrap, and the second takes over a moment before.
    expect(first?.stoppedAt).toBeCloseTo(40, 1);
    const second = made.context.sources[1];
    expect(second?.started?.when).toBeCloseTo(40 - 0.04, 2);
    expect(second?.started?.offset).toBeCloseTo((39.96 + 0.3) % 40, 2);
  });

  it('seeks at once with a short fade for a large error', async () => {
    const made = await settled();
    const first = made.context.sources[0];
    made.tableOffset.ms = 5000;
    await ticks(made, 6);
    expect(made.context.sources).toHaveLength(2);
    expect(made.context.playing()).not.toContain(first);
    const second = made.context.sources[1];
    expect(second?.started?.offset).toBeCloseTo((second?.started?.when ?? 0) + 5, 2);
  });

  it('judges nothing while the context\'s clock stands', async () => {
    const made = await settled();
    made.tableOffset.ms = 0;
    for (let i = 0; i < 30; i++) {
      made.tableOffset.ms += 250;
      made.player.tick();
      await made.player.settled();
    }
    expect(made.context.sources).toHaveLength(1);
    // The clock runs again: now the error counts, and it seeks.
    await ticks(made, 6);
    expect(made.context.sources).toHaveLength(2);
  });
});

describe('a long sound', () => {
  async function tagged(seconds: number): Promise<SoundBytes> {
    const writer = new OggOpusWriter(writeOpusHead(2, 312));
    const packet = new Uint8Array(4);
    packet[0] = 31 << 3;
    for (let i = 0; i <= (seconds * RATE) / 960; i++) writer.addPacket(packet);
    const bytes = new Uint8Array(await writer.finish(seconds * RATE).arrayBuffer());
    return { byteLength: bytes.length, read: (start, end) => Promise.resolve(bytes.slice(start, end)) };
  }

  it('schedules windows end to end, about 20 s ahead, and wraps exactly', async () => {
    const bytes = await tagged(100);
    const windows: Array<[number, number]> = [];
    const decode: WindowDecode = (sound2, _packets, fromGranule, count) => {
      windows.push([fromGranule - sound2.preSkip, count]);
      return Promise.resolve(fakeBuffer(count));
    };
    const { context, player, advance } = rig(() => bytes, decode);
    player.setState(table({ layers: [layer(sound('long', 100), { startAt: -85_000 })] }));
    for (let i = 0; i < 12; i++) await advance(i === 0 ? 0 : 0.25);
    // Starts past the margin at about 85 s, with every window ending where the next starts.
    const ordered = context.sources.filter((source) => source.started).sort((a, b) => (a.started?.when ?? 0) - (b.started?.when ?? 0));
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1];
      const end = (previous?.started?.when ?? 0) + (previous?.buffer?.length ?? 0) / RATE - (previous?.started?.offset ?? 0);
      expect(ordered[i]?.started?.when).toBeCloseTo(end, 9);
    }
    // At 100 s of the sound it goes back to its frame 0, in a window of its own.
    const wrap = windows.findIndex(([frame]) => frame === 0);
    expect(wrap).toBeGreaterThan(0);
    const before = windows[wrap - 1];
    expect((before?.[0] ?? 0) + (before?.[1] ?? 0)).toBe(100 * RATE);
    const ahead = ordered.reduce((sum, source) => sum + (source.buffer?.length ?? 0), 0) / RATE;
    expect(ahead).toBeGreaterThanOrEqual(20);
    expect(ahead).toBeLessThan(30);
    expect(context.decodeCalls).toBe(0);
  });
});

describe('a rebuilt context', () => {
  it('brings everything back in its place', async () => {
    const { context, player, advance } = rig();
    player.setState(table({ layers: [layer(sound('rain'))] }));
    await player.settled();
    await advance(2);
    const fresh = new FakeSoundContext();
    fresh.currentTime = 100;
    player.useContext(fresh);
    await player.settled();
    const [source] = fresh.playing();
    expect(source).toBeDefined();
    // The table says 2 s still, whatever the new context's clock reads.
    expect(source?.started?.offset).toBeCloseTo(2, 1);
    expect(context.playing().every((old) => old.stoppedAt !== null)).toBe(true);
  });
});

describe('disposing', () => {
  it('stops everything and takes no more ticks to heart', async () => {
    const { context, player } = rig();
    player.setState(table({ layers: [layer(sound('rain'))], music: music([sound('song')]) }));
    await player.settled();
    const sources = context.sources.length;
    player.dispose();
    player.tick();
    await player.settled();
    expect(context.sources.length).toBe(sources);
    expect(context.playing()).toHaveLength(0);
  });
});
