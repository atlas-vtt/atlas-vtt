import type { BlobWindow } from './blobWindow';
import { SoundImportError, type PcmSource } from './demuxTypes';

const PIECE_FRAMES = 48_000;
const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

export function isWav(head: Uint8Array): boolean {
  return text(head, 0, 4) === 'RIFF' && text(head, 8, 4) === 'WAVE';
}

function text(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function sampleReader(view: DataView, format: number, bits: number): (at: number) => number {
  if (format === FORMAT_FLOAT && bits === 32) return (at) => view.getFloat32(at, true);
  if (format === FORMAT_FLOAT && bits === 64) return (at) => view.getFloat64(at, true);
  if (format === FORMAT_PCM && bits === 8) return (at) => (view.getUint8(at) - 128) / 128;
  if (format === FORMAT_PCM && bits === 16) return (at) => view.getInt16(at, true) / 32768;
  if (format === FORMAT_PCM && bits === 24) return (at) => ((view.getInt8(at + 2) << 16) | view.getUint16(at, true)) / 8388608;
  if (format === FORMAT_PCM && bits === 32) return (at) => view.getInt32(at, true) / 2147483648;
  throw new SoundImportError('unsupported-codec', `WAV format ${format} with ${bits} bits`);
}

export async function demuxWav(window: BlobWindow): Promise<PcmSource> {
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (offset + 8 <= window.size) {
    const header = await window.at(offset, 64);
    if (header.length < 8) break;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const id = text(header, 0, 4);
    const size = view.getUint32(4, true);
    if (id === 'fmt ' && header.length >= 24) {
      format = view.getUint16(8, true);
      channels = view.getUint16(10, true);
      sampleRate = view.getUint32(12, true);
      bits = view.getUint16(22, true);
      if (format === FORMAT_EXTENSIBLE && header.length >= 34) format = view.getUint16(32, true);
    } else if (id === 'data') {
      if (!channels || !sampleRate || !bits) break;
      // A streaming writer may leave the size at zero or at its largest.
      const available = window.size - offset - 8;
      return pcmSource(window, offset + 8, size === 0 || size > available ? available : size, format, bits, channels, sampleRate);
    }
    offset += 8 + size + (size % 2);
  }
  throw new SoundImportError('unreadable', 'A WAV file without format and data.');
}

function pcmSource(window: BlobWindow, start: number, size: number, format: number, bits: number, channels: number, sampleRate: number): PcmSource {
  const stride = (bits >> 3) * channels;
  // Checked now, so an unsupported file is refused before anything else begins.
  sampleReader(new DataView(new ArrayBuffer(8)), format, bits);
  let read = 0;
  return {
    type: 'pcm',
    sampleRate,
    channels,
    progress: () => (size > 0 ? read / size : 1),
    async *pieces() {
      while (read + stride <= size) {
        const frames = Math.min(PIECE_FRAMES, Math.floor((size - read) / stride));
        const bytes = await window.at(start + read, frames * stride);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const sample = sampleReader(view, format, bits);
        const planes = Array.from({ length: channels }, () => new Float32Array(frames));
        for (let frame = 0; frame < frames; frame++) {
          for (let channel = 0; channel < channels; channel++) {
            const plane = planes[channel];
            if (plane) plane[frame] = sample(frame * stride + (channel * stride) / channels);
          }
        }
        read += frames * stride;
        yield planes;
      }
    },
  };
}
