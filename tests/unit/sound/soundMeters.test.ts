import { describe, expect, it } from 'vitest';
import type { SoundAnalyser, SoundNode } from '@/app/sound/engine/audioNodes';
import { PeakCollector, PEAK_BUCKETS } from '@/app/sound/codec/soundPeaks';
import { layerKeyOfVoice, layerVoiceId } from '@/app/sound/engine/desiredSound';
import { PlayerMeters } from '@/app/sound/engine/playerMeters';
import { SoundPlayer } from '@/app/sound/engine/soundPlayer';
import { FakeSoundContext } from '../../helpers/fakeSoundContext';
import { emptyBytes, layer, sound, table } from '../../helpers/soundPlayerRig';

function analyserOf(peak: number): SoundAnalyser {
  return {
    fftSize: 0,
    connect: () => undefined,
    disconnect: () => undefined,
    getFloatTimeDomainData: (into) => {
      into.fill(-peak);
    },
  };
}

class Node implements SoundNode {
  readonly outputs = new Set<SoundNode>();
  connect(destination: SoundNode): void { this.outputs.add(destination); }
  disconnect(destination?: SoundNode): void {
    if (destination) this.outputs.delete(destination);
    else this.outputs.clear();
  }
}

class MeteredContext extends FakeSoundContext {
  analysers = 0;
  createAnalyser(): SoundAnalyser {
    this.analysers++;
    return analyserOf(0.5);
  }
}

describe('reading levels', () => {
  it('hangs one analyser off each point, and takes it off the same node alone', () => {
    const meters = new PlayerMeters(() => analyserOf(0.5));
    const music = new Node();
    const keepsIts = new Node();
    music.connect(keepsIts);
    meters.follow(new Map([['music', { strip: 'music', node: music, afterSilence: true }]]));
    expect(music.outputs.size).toBe(2);
    meters.follow(new Map());
    expect([...music.outputs]).toEqual([keepsIts]);
  });

  it('reads how loud a moment was, lets the Silence fade through only where a point lies before it', () => {
    const meters = new PlayerMeters(() => analyserOf(0.5));
    meters.follow(new Map([
      ['music', { strip: 'music', node: new Node(), afterSilence: true }],
      ['layer:1:rain', { strip: 'rain', node: new Node(), afterSilence: false }],
    ]));
    const levels = new Map<string, number>();
    meters.read(levels, 0.25);
    expect(levels.get('music')).toBe(0.5);
    expect(levels.get('rain')).toBe(0.125);
  });

  it('knows a layer voice by its key, whatever the key holds', () => {
    const id = layerVoiceId(layer(sound('ha:sh'), { startAt: 12 }));
    expect(layerKeyOfVoice(id)).toBe('ha:sh');
    expect(layerKeyOfVoice('music:1:2:o:a')).toBeNull();
  });

  it('costs a player nothing until someone looks, and all of it again when they stop', () => {
    const context = new MeteredContext();
    const player = new SoundPlayer({ context, tableNow: () => 0, resolve: () => emptyBytes });
    player.setState(table({ layers: [layer(sound('rain'))] }));
    expect(context.analysers).toBe(0);
    const levels = new Map([['stale', 1]]);
    player.readMeters(levels);
    expect(levels.size).toBe(0);
    player.showMeters(true);
    expect(context.analysers).toBe(3);
    player.readMeters(levels);
    expect([...levels.keys()].sort()).toEqual(['master', 'music', 'rain']);
    // What comes in later gets its own, what stays keeps the one it has.
    player.setState(table({ layers: [layer(sound('rain')), layer(sound('wind'))] }));
    expect(context.analysers).toBe(4);
    player.showMeters(false);
    player.readMeters(levels);
    expect(levels.size).toBe(0);
  });

  it('has no meters on a context without analysers, as a test or an old engine has', () => {
    const player = new SoundPlayer({ context: new FakeSoundContext(), tableNow: () => 0, resolve: () => emptyBytes });
    player.showMeters(true);
    const levels = new Map<string, number>();
    player.readMeters(levels);
    expect(levels.size).toBe(0);
  });
});

describe('how a sound goes over its length', () => {
  it('fills every bucket from the frames it is told, the loudest part at 255', () => {
    const frames = PEAK_BUCKETS * 100;
    const collector = new PeakCollector(frames);
    const quiet = new Float32Array(frames / 2).fill(0.1);
    const loud = new Float32Array(frames / 2).fill(0.4);
    collector.add(quiet, quiet.length);
    collector.add(loud, loud.length);
    const peaks = collector.result();
    expect(peaks).toHaveLength(PEAK_BUCKETS);
    expect(peaks[0]).toBe(64);
    expect(peaks[PEAK_BUCKETS - 1]).toBe(255);
  });

  it('says nothing of silence, and never reads past its last bucket', () => {
    const collector = new PeakCollector(10);
    collector.add(new Float32Array(100), 100);
    expect(collector.result().every((value) => value === 0)).toBe(true);
  });
});
