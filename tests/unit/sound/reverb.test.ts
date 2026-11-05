import { describe, expect, it } from 'vitest';
import type { LayerPlay, Mood, SoundInfo, TableSound } from '@/app/sound/soundTypes';
import type { SoundBuffer, SoundConvolverNode, SoundNode } from '@/app/sound/engine/audioNodes';
import { desiredSound, reverbSend } from '@/app/sound/engine/desiredSound';
import { roomImpulse, roomTailSeconds } from '@/app/sound/engine/roomImpulse';
import { RoomReverb } from '@/app/sound/engine/roomReverb';
import { SoundClockMap } from '@/app/sound/engine/soundClockMap';
import { SOUND_RATE } from '@/app/sound/engine/soundMath';
import { mixDiffersFrom } from '@/app/soundDirector/mixChange';
import { addLayer, setLayerReverb, setRoom, startMusic } from '@/app/soundDirector/liveEdits';
import { moodTransition } from '@/app/soundDirector/moodTransition';
import { EMPTY_MIX, mixAsMood } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND, onShiftedClock, ROOM_FADE_MS } from '@/app/soundDirector/tableSound';
import { moodOf } from '@/app/soundLibrary/moodFile';
import { parseSoundState } from '@/app/online/protocol/sound';
import { wireState } from '@/app/online/gm/sound/soundWire';
import { FakeSoundContext } from '../../helpers/fakeSoundContext';

const info = (key: string): SoundInfo => ({ key, frames: 10 * SOUND_RATE, gainDb: 0 });
const SOUNDS = new Map([['rain', info('k-rain')], ['fire', info('k-fire')], ['song', info('k-song')]]);

function mood(partial: Partial<Mood>): Mood {
  return { id: 'm', name: 'm', order: 1, fadeSeconds: 2, music: 'keep', layers: [], ...partial };
}

const layerOf = (state: TableSound, key: string): LayerPlay | undefined => state.layers.find((play) => play.sound.key === key);

describe('a room\'s impulse', () => {
  it('is the same on every device, as loud for every room, and dies away', () => {
    for (const room of ['room', 'hall', 'cave', 'cathedral'] as const) {
      const [left, right] = roomImpulse(room, SOUND_RATE);
      expect(roomImpulse(room, SOUND_RATE)[0]).toEqual(left);
      expect(left.length).toBeCloseTo(roomTailSeconds(room) * SOUND_RATE, -2);
      for (const side of [left, right]) {
        let energy = 0;
        for (const value of side) energy += value * value;
        expect(energy).toBeCloseTo(1, 5);
        const tenth = Math.floor(side.length / 10);
        const sum = (from: number): number => side.subarray(from, from + tenth).reduce((total, value) => total + value * value, 0);
        expect(sum(side.length - tenth)).toBeLessThan(sum(0) / 1000);
      }
      expect(right).not.toEqual(left);
    }
    expect(roomTailSeconds('cathedral')).toBeGreaterThan(roomTailSeconds('cave'));
    expect(roomTailSeconds('cave')).toBeGreaterThan(roomTailSeconds('hall'));
    expect(roomTailSeconds('hall')).toBeGreaterThan(roomTailSeconds('room'));
  });
});

describe('what a voice sends', () => {
  it('is the amount squared, nothing for what is no amount, and the room the state names', () => {
    expect(reverbSend(0.5)).toBe(0.25);
    expect(reverbSend(2)).toBe(1);
    for (const nothing of [undefined, 0, -1, Number.NaN]) expect(reverbSend(nothing)).toBe(0);
    const dry = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: 0 }] }), SOUNDS, 0);
    expect(desiredSound(dry, 100)).toMatchObject({ sending: false, room: { id: 'room' } });
    const wet = moodTransition(EMPTY_TABLE_SOUND, mood({ room: 'cave', layers: [{ sound: 'rain', levelDb: 0, reverb: 0.5 }] }), SOUNDS, 0);
    expect(desiredSound(wet, 100)).toMatchObject({ sending: true, room: { id: 'cave' } });
    expect(desiredSound(wet, 100).voices[0]?.send).toBe(0.25);
  });
});

describe('reverb in the mix', () => {
  it('a mood sets each play\'s reverb and changes the room on its own fade', () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: 0, reverb: 0.3 }] }), SOUNDS, 0);
    expect(layerOf(first, 'k-rain')?.reverb).toBe(0.3);
    expect(first.room).toBeUndefined();
    const second = moodTransition(first, mood({ room: 'cathedral', fadeSeconds: 3, layers: [{ sound: 'rain', levelDb: 0 }, { sound: 'fire', levelDb: 0, reverb: 0.8 }] }), SOUNDS, 5000);
    expect(layerOf(second, 'k-rain')?.reverb).toBeUndefined();
    expect(layerOf(second, 'k-fire')?.reverb).toBe(0.8);
    expect(second.room).toEqual({ id: 'cathedral', fade: { at: 5050, ms: 3000 } });
    // Pressing it again changes no room.
    expect(moodTransition(second, mood({ room: 'cathedral' }), SOUNDS, 9000).room).toBe(second.room);
  });

  it('the desk turns a layer\'s reverb, crossfades the room, and keeps reverb where sound comes back or a list starts anew', () => {
    const base = addLayer(EMPTY_TABLE_SOUND, info('k-rain'), 0, 0, 0, 0, 0.4);
    expect(layerOf(setLayerReverb(base, 'k-rain', 1.7, 10), 'k-rain')?.reverb).toBe(1);
    expect(layerOf(setLayerReverb(base, 'k-rain', 0, 10), 'k-rain')).not.toHaveProperty('reverb');
    expect(setRoom(base, 'room', 10)).toBe(base);
    expect(setRoom(base, 'hall', 10).room).toEqual({ id: 'hall', fade: { at: 10, ms: ROOM_FADE_MS } });
    const music = startMusic(EMPTY_TABLE_SOUND, [info('k-song')], false, 0, 1, 0, 0, 0, undefined, 0.6);
    expect(startMusic(music, [info('k-fire')], false, 0, 2, 100, 0, 0).music?.reverb).toBe(0.6);
    expect(onShiftedClock(setRoom(base, 'cave', 10), 1000).room?.fade.at).toBe(1010);
  });

  it('saves as it sounds, and a mood whose room or reverb differs is changed', () => {
    const table = setRoom(moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: 0, reverb: 0.5 }] }), SOUNDS, 0), 'hall', 0);
    const saved = mixAsMood({ ...EMPTY_MIX, table }, (key) => key.slice(2), 2, 1000);
    expect(saved.layers).toEqual([{ sound: 'rain', levelDb: 0, reverb: 0.5 }]);
    expect(saved.room).toBe('hall');
    const known = (): boolean => true;
    expect(mixDiffersFrom(mood({ room: 'hall', layers: [{ sound: 'rain', levelDb: 0, reverb: 0.5 }] }), saved, known)).toBe(false);
    expect(mixDiffersFrom(mood({ layers: [{ sound: 'rain', levelDb: 0, reverb: 0.5 }] }), saved, known)).toBe(true);
    expect(mixDiffersFrom(mood({ room: 'hall', layers: [{ sound: 'rain', levelDb: 0 }] }), saved, known)).toBe(true);
  });

  it('a mood file keeps a room it knows and amounts within 0 to 1', () => {
    const read = moodOf({ id: 'm', name: 'Crypt', order: 1, room: 'cave', music: { tracks: ['a'], shuffle: false, levelDb: 0, reverb: 3 }, layers: [{ sound: 'rain', levelDb: 0, reverb: 0.25 }, { sound: 'fire', levelDb: 0, reverb: 'loud' }] });
    expect(read?.room).toBe('cave');
    expect(read?.music).toMatchObject({ reverb: 1 });
    expect(read?.layers).toEqual([{ sound: 'rain', levelDb: 0, reverb: 0.25 }, { sound: 'fire', levelDb: 0 }]);
    expect(moodOf({ id: 'm', name: 'x', order: 1, room: 'spaceship' })?.room).toBeUndefined();
  });

  it('reaches players with its room and amounts, and a page reads a room it does not know as none', () => {
    const table = setRoom(addLayer(EMPTY_TABLE_SOUND, info('k-rain'), 0, 0, 0, 0, 0.4), 'cave', 0);
    const wire = wireState(table, () => ({ key: 'ab'.repeat(32) }));
    expect(wire.room).toEqual(table.room);
    expect(wire.layers[0]?.reverb).toBe(0.4);
    const read = parseSoundState(JSON.parse(JSON.stringify(wire)));
    expect(read?.room?.id).toBe('cave');
    expect(read?.layers[0]?.reverb).toBe(0.4);
    const odd = parseSoundState({ ...JSON.parse(JSON.stringify(wire)), room: { id: 'spaceship', fade: { at: 0, ms: 0 } }, layers: [{ ...wire.layers[0], reverb: 'lots' }] });
    expect(odd?.room).toBeUndefined();
    expect(odd?.layers[0]).not.toHaveProperty('reverb');
  });
});

class ConvolverContext extends FakeSoundContext {
  readonly convolvers: Array<SoundConvolverNode & { connected: SoundNode[] }> = [];

  createConvolver(): SoundConvolverNode {
    const convolver = { buffer: null as SoundBuffer | null, normalize: true, connected: [] as SoundNode[], connect: (to: SoundNode) => convolver.connected.push(to), disconnect: () => undefined };
    this.convolvers.push(convolver);
    return convolver;
  }
}

describe('the room\'s reverb', () => {
  const at = (seconds: number): SoundClockMap => new SoundClockMap(seconds, seconds * 1000, SOUND_RATE);
  const output: SoundNode = { connect: () => undefined, disconnect: () => undefined };

  it('builds a room only once something sends, crossfades to another and lets each go after its tail', () => {
    const context = new ConvolverContext();
    const reverb = new RoomReverb(context, output);
    reverb.follow({ id: 'room', fade: { at: 0, ms: 0 } }, false, at(0));
    expect(reverb.rooms).toEqual([]);
    reverb.follow({ id: 'room', fade: { at: 0, ms: 0 } }, true, at(1));
    expect(reverb.rooms).toEqual(['room']);
    expect(context.convolvers[0]?.normalize).toBe(false);
    expect(context.convolvers[0]?.buffer?.length).toBe(roomImpulse('room', SOUND_RATE)[0].length);
    reverb.follow({ id: 'hall', fade: { at: 2000, ms: 1000 } }, true, at(2));
    expect(reverb.rooms).toEqual(['room', 'hall']);
    // The old room rings out past the crossfade, then goes.
    reverb.follow({ id: 'hall', fade: { at: 2000, ms: 1000 } }, true, at(3));
    expect(reverb.rooms).toEqual(['room', 'hall']);
    reverb.follow({ id: 'hall', fade: { at: 2000, ms: 1000 } }, true, at(3 + roomTailSeconds('room') + 0.01));
    expect(reverb.rooms).toEqual(['hall']);
    // Nothing sends any more: once its tail is over, the hall goes too.
    reverb.follow({ id: 'hall', fade: { at: 2000, ms: 1000 } }, false, at(5));
    expect(reverb.rooms).toEqual(['hall']);
    reverb.follow({ id: 'hall', fade: { at: 2000, ms: 1000 } }, false, at(5 + roomTailSeconds('hall')));
    expect(reverb.rooms).toEqual([]);
  });

  it('plays dry where the context has no convolver', () => {
    const reverb = new RoomReverb(new FakeSoundContext(), output);
    reverb.follow({ id: 'cave', fade: { at: 0, ms: 0 } }, true, at(1));
    expect(reverb.rooms).toEqual([]);
  });
});
