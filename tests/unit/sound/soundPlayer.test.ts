import { describe, expect, it } from 'vitest';
import { FakeSoundContext } from '../../helpers/fakeSoundContext';
import { emptyBytes, layer, music, playerRig as rig, sound, table } from '../../helpers/soundPlayerRig';
import type { SoundBytes } from '@/app/sound/soundTypes';

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
