import type { PositionedPacket } from '../codec/oggOpusReader';
import type { StreamHead } from '../codec/windowedSound';
import { OggOpusWriter } from '../codec/oggOpusWriter';
import { writeOpusHead } from '../codec/opusFormat';
import type { SoundBuffer, SoundContext } from './audioNodes';
import { SOUND_RATE } from './soundMath';

/** Opus converges within 80 ms; 320 ms was no measurable difference from a whole decode. */
export const PRE_ROLL_FRAMES = 15_360;

/** Decodes `count` frames at a position from the packets around it. */
export type WindowDecode = (sound: StreamHead, packets: readonly PositionedPacket[], fromGranule: number, count: number) => Promise<SoundBuffer>;

/** Only what the decoder needs: from the pre-roll to the packet holding the last frame wanted. */
function neededPackets(packets: readonly PositionedPacket[], fromGranule: number, count: number): PositionedPacket[] {
  const end = fromGranule + count;
  return packets.filter((packet) => packet.startGranule < end && packet.startGranule + packet.frames > fromGranule - PRE_ROLL_FRAMES);
}

/**
 * Through `AudioDecoder`, which can run at any position. Whether a decoder drops the pre-skip after a
 * `configure` is not settled between engines (w3c/webcodecs #626), and it does not matter here: flush gives
 * all of the output, so its last sample is where the last packet ends, and each position is counted from
 * there. The end trim is ours in the same way.
 */
export function webCodecsWindowDecode(context: SoundContext): WindowDecode {
  return async (sound, packets, fromGranule, count) => {
    const needed = neededPackets(packets, fromGranule, count);
    const last = needed.at(-1);
    if (!last) throw new Error('No audio at that position.');
    const planes = Array.from({ length: sound.channels }, () => [] as Float32Array<ArrayBuffer>[]);
    let total = 0;
    const failures: DOMException[] = [];
    const decoder = new AudioDecoder({
      output: (data) => {
        const frames = data.numberOfFrames;
        planes.forEach((plane, planeIndex) => {
          const samples = new Float32Array(frames);
          data.copyTo(samples, { planeIndex, format: 'f32-planar' });
          plane.push(samples);
        });
        total += frames;
        data.close();
      },
      error: (error) => {
        failures.push(error);
      },
    });
    decoder.configure({ codec: 'opus', sampleRate: SOUND_RATE, numberOfChannels: sound.channels, description: sound.head });
    for (const packet of needed) {
      decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round((packet.startGranule * 1e6) / SOUND_RATE), duration: Math.round((packet.frames * 1e6) / SOUND_RATE), data: packet.bytes }));
    }
    await decoder.flush();
    if (decoder.state !== 'closed') decoder.close();
    if (failures[0]) throw failures[0];
    const firstGranule = last.startGranule + last.frames - total;
    const skip = fromGranule - firstGranule;
    if (skip < 0 || skip + count > total) throw new Error('The decoder gave less audio than the window needs.');
    const buffer = context.createBuffer(sound.channels, count, SOUND_RATE);
    planes.forEach((pieces, channel) => buffer.copyToChannel(cut(pieces, skip, count), channel));
    return buffer;
  };
}

function cut(pieces: readonly Float32Array<ArrayBuffer>[], skip: number, count: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(count);
  let position = 0;
  let filled = 0;
  for (const piece of pieces) {
    const from = Math.max(0, skip - position);
    if (from < piece.length && filled < count) {
      const part = piece.subarray(from, Math.min(piece.length, from + count - filled));
      out.set(part, filled);
      filled += part.length;
    }
    position += piece.length;
  }
  return out;
}

/**
 * For engines without WebCodecs audio: a small Ogg file per window, whose pre-skip is the pre-roll and
 * whose end is the window's end, so that `decodeAudioData` does both trims.
 */
export function wholeFileWindowDecode(context: SoundContext): WindowDecode {
  return async (sound, packets, fromGranule, count) => {
    const needed = neededPackets(packets, fromGranule, count);
    const first = needed[0];
    if (!first) throw new Error('No audio at that position.');
    const writer = new OggOpusWriter(writeOpusHead(sound.channels, fromGranule - first.startGranule));
    for (const packet of needed) writer.addPacket(packet.bytes);
    const file = await writer.finish(count).arrayBuffer();
    const buffer = await context.decodeAudioData(file);
    if (buffer.length !== count) throw new Error('A decoded window has the wrong length.');
    return buffer;
  };
}

/** The decoder for this runtime: `AudioDecoder` where it reads Opus, else whole-file windows. */
export async function chooseWindowDecode(context: SoundContext, sound: StreamHead): Promise<WindowDecode> {
  if (typeof AudioDecoder !== 'undefined') {
    const { supported } = await AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: SOUND_RATE, numberOfChannels: sound.channels, description: sound.head }).catch(() => ({ supported: false }));
    if (supported) return webCodecsWindowDecode(context);
  }
  return wholeFileWindowDecode(context);
}
