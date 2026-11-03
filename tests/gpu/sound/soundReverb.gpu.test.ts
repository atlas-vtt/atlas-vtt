import { beforeAll, describe, expect, it } from 'vitest';
import type { RoomId, TableSound } from '@/app/sound/soundTypes';
import { removeLayer, setLayerReverb, setRoom } from '@/app/soundDirector/liveEdits';
import { largestStep, layerOf, loadFixtures, render, rmsAt, secondsToFrames, tableOf, type Fixtures } from './soundHarness';

const WINDOW = 2400;
const LEAVES_AT = 2;

/**
 * Reverb as the real graph renders it on an offline context: a tone that stops leaves its room ringing
 * for as long as that room rings, and a dry one leaves nothing.
 */
describe('reverb, rendered', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  const stopping = (room: RoomId, reverb: number): { first: TableSound; gone: TableSound } => {
    const first = tableOf({ layers: [layerOf(fixtures.tone220, { reverb })], ...(room !== 'room' && { room: { id: room, fade: { at: 0, ms: 0 } } }) });
    return { first, gone: removeLayer(first, fixtures.tone220.key, LEAVES_AT * 1000, 20) };
  };

  const tailAt = async (room: RoomId, reverb: number, seconds: number): Promise<{ tail: number; whole: number; peak: number }> => {
    const { first, gone } = stopping(room, reverb);
    const samples = await render(first, fixtures, { seconds: LEAVES_AT + seconds + 0.2, at: [[LEAVES_AT, (player) => player.setState(gone)]] });
    return {
      tail: rmsAt(samples, secondsToFrames(LEAVES_AT + seconds), WINDOW),
      whole: rmsAt(samples, secondsToFrames(1), WINDOW),
      peak: samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0),
    };
  };

  it('rings on after the sound stops, longer in a cave than in a room, and never clips', async () => {
    const dry = await tailAt('room', 0, 0.3);
    const room = await tailAt('room', 1, 0.3);
    expect(dry.tail).toBeLessThan(1e-4);
    // A room falls 60 dB over 0.7 s: 0.3 s on, about -26 dB under what it rang with.
    expect(room.tail).toBeGreaterThan(room.whole / 200);
    expect(room.peak).toBeLessThan(1);
    const roomLate = await tailAt('room', 1, 1.2);
    const caveLate = await tailAt('cave', 1, 1.2);
    expect(caveLate.tail).toBeGreaterThan(roomLate.tail * 10);
    expect(caveLate.peak).toBeLessThan(1);
  }, 60_000);

  it('turns a knob and changes the room without a click', async () => {
    const first = tableOf({ layers: [layerOf(fixtures.tone220, { reverb: 0.2 })] });
    const turned = setLayerReverb(first, fixtures.tone220.key, 1, 1000);
    const moved = setRoom(turned, 'cathedral', 2000);
    const samples = await render(first, fixtures, { seconds: 6, at: [[1, (player) => player.setState(turned)], [2, (player) => player.setState(moved)]] });
    // The steps a sine takes between samples grow with what rings, so the changes are held to the mix after them.
    const settled = largestStep(samples, secondsToFrames(5), secondsToFrames(5.8));
    expect(largestStep(samples, secondsToFrames(0.95), secondsToFrames(1.3))).toBeLessThan(settled * 1.5);
    expect(largestStep(samples, secondsToFrames(1.95), secondsToFrames(3.8))).toBeLessThan(settled * 1.5);
  }, 60_000);
});
