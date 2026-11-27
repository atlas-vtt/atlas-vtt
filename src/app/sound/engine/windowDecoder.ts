import type { PositionedPacket } from '../codec/oggOpusReader';
import type { StreamHead } from '../codec/windowedSound';
import { OggOpusWriter } from '../codec/oggOpusWriter';
import { writeOpusHead } from '../codec/opusFormat';
import type { SoundBuffer, SoundContext } from './audioNodes';

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
 * A small Ogg file per window, whose pre-skip is the pre-roll and whose end is the window's end, so that
 * `decodeAudioData` does both trims, off the page's thread, with one answer per window. Never `AudioDecoder`:
 * it answers once per packet on the page's thread, some 270 tasks a window, and a page redrawn every frame
 * holds those back for longer than the window plays.
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
