import { describe, expect, it } from 'vitest';
import { BlobWindow } from '../../../src/app/sound/codec/demux/blobWindow';
import { demuxFlac } from '../../../src/app/sound/codec/demux/flacDemux';
import type { EncodedPacket } from '../../../src/app/sound/codec/demux/demuxTypes';

function crc8(bytes: readonly number[]): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function crc16(bytes: readonly number[]): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** A frame header of a 4096-sample block at 44.1 kHz, stereo, 16 bits, with its CRC-8. */
function header(frameNumber: number): number[] {
  const bytes = [0xff, 0xf8, 0xc9, 0x18, frameNumber];
  return [...bytes, crc8(bytes)];
}

/** A whole frame: header, payload, and the CRC-16 of both. */
function frame(frameNumber: number, payload: readonly number[]): number[] {
  const body = [...header(frameNumber), ...payload];
  const crc = crc16(body);
  return [...body, crc >> 8, crc & 0xff];
}

function streamInfo(): number[] {
  const info = new Array<number>(34).fill(0);
  info[0] = 0x10; info[1] = 0x00; // min block 4096
  info[2] = 0x10; info[3] = 0x00; // max block 4096
  // 44100 Hz, 2 channels, 16 bits: 20 bits of rate, 3 of channels - 1, 5 of bits - 1.
  info[10] = 0x0a; info[11] = 0xc4; info[12] = 0x42; info[13] = 0xf0;
  return [0x80, 0x00, 0x00, 34, ...info];
}

async function packetsOf(bytes: number[]): Promise<EncodedPacket[]> {
  const source = await demuxFlac(new BlobWindow(new Blob([new Uint8Array(bytes)])));
  const packets: EncodedPacket[] = [];
  for await (const packet of source.packets()) packets.push(packet);
  return packets;
}

const noise = (length: number, seed: number): number[] => Array.from({ length }, (_, i) => (i * 37 + seed * 11) & 0x7f);

describe('the FLAC demuxer', () => {
  it('keeps a frame whole when its audio holds what reads as a frame header', async () => {
    // A valid header, CRC-8 included, in the middle of frame 0's audio: only the frame's CRC-16 tells it is no frame.
    const first = frame(0, [...noise(40, 1), ...header(1), ...noise(40, 2)]);
    const second = frame(1, noise(60, 3));
    const third = frame(2, noise(60, 4));
    const packets = await packetsOf([0x66, 0x4c, 0x61, 0x43, ...streamInfo(), ...first, ...second, ...third]);
    expect(packets.map((packet) => packet.data.length)).toEqual([first.length, second.length, third.length]);
  });

  it('reads each byte of a frame once, however many false headers its audio holds', async () => {
    // A hostile file: 400 KB of headers that pass their CRC-8, none closing a frame.
    const fakes = Array.from({ length: 70_000 }, () => header(1)).flat();
    const started = performance.now();
    const frames = [...frame(0, fakes), ...frame(1, noise(60, 5))];
    const packets = await packetsOf([0x66, 0x4c, 0x61, 0x43, ...streamInfo(), ...frames]);
    expect(performance.now() - started).toBeLessThan(2000);
    // So many candidates may meet a CRC-16 by chance, which real audio, with one or two per frame, does not; no byte is lost either way.
    expect(packets.reduce((sum, packet) => sum + packet.data.length, 0)).toBe(frames.length);
  });
});
