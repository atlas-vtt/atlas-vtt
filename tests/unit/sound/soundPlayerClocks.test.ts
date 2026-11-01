import { describe, expect, it } from 'vitest';
import { OggOpusWriter } from '@/app/sound/codec/oggOpusWriter';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';
import { SoundPlayer } from '@/app/sound/engine/soundPlayer';
import { driftAction } from '@/app/sound/engine/soundVoice';
import type { WindowDecode } from '@/app/sound/engine/windowDecoder';
import type { LayerPlay, SoundBytes, TableSound } from '@/app/sound/soundTypes';
import { fakeBuffer, FakeSoundContext } from '../../helpers/fakeSoundContext';
import { emptyBytes, layer, playerRig as rig, RATE, sound, table, type PlayerRig as Rig } from '../../helpers/soundPlayerRig';

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

describe('three hours of a clock that runs its own way', () => {
  it('stays within the limit by small corrections, with no seek and no stop', async () => {
    const context = new FakeSoundContext();
    let table = 0;
    const player = new SoundPlayer({ context, tableNow: () => table, resolve: () => emptyBytes });
    const rain = layer(sound('rain', 40));
    player.setState(table0(rain));
    await player.settled();
    const expectedPpm = 50;
    const seconds = 3 * 3600;
    let worst = 0;
    for (let tick = 1; tick <= seconds * 4; tick++) {
      context.currentTime = tick * 0.25;
      table = tick * 250 * (1 + expectedPpm / 1e6);
      player.tick();
      if (tick % 16 === 0) await player.settled();
      const current = context.playing().at(-1);
      if (current?.started) {
        const played = (context.currentTime - current.started.when + current.started.offset) % 40;
        const wanted = (table / 1000) % 40;
        const off = Math.min(Math.abs(played - wanted), 40 - Math.abs(played - wanted));
        // Only a source that has begun says where the sound is.
        if (current.started.when <= context.currentTime) worst = Math.max(worst, off);
      }
    }
    // 50 ppm over three hours is 540 ms if nothing corrects it.
    console.log(`drift: worst ${(worst * 1000).toFixed(0)} ms over 3 h at ${expectedPpm} ppm, ${context.sources.length} sources`);
    expect(worst).toBeLessThan(0.15);
    expect(context.sources.length).toBeLessThan(30);
    expect(context.playing().length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

function table0(play: LayerPlay): TableSound {
  return table({ layers: [play] });
}

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
