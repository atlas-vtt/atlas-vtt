import { MAX_PAGE_BYTES, packetsOfPage, readPage, OggCorruptError } from './oggPages';
import { BlobWindow } from './demux/blobWindow';
import { SoundImportError } from './demux/demuxTypes';
import { opusPacketFrames, readOpusHead, writeOpusHead } from './opusFormat';
import { queueRoom } from './opusOutput';

const PROGRESS_STEP = 0.05;

/**
 * Reads a written file through its pages and a real decoder, and holds its length to what went in: encoder
 * timing is not settled (w3c/webcodecs #626), so this must not be taken on trust. Refuses rather than keep a
 * sound that would not loop right.
 */
export async function verifyOggOpus(file: Blob, frames: number, channels: number, onProgress: (share: number) => void): Promise<void> {
  const window = new BlobWindow(file);
  let total = 0;
  let packetFrames = 0;
  const failures: Error[] = [];
  let preSkip = 0;
  let finalGranule = -1;
  const decoder = new AudioDecoder({
    output: (data) => {
      total += data.numberOfFrames;
      data.close();
    },
    error: (error) => {
      failures.push(error);
    },
  });
  let offset = 0;
  let pageIndex = 0;
  let shown = 0;
  try {
    for (;;) {
      const page = readPage(await window.at(offset, MAX_PAGE_BYTES), 0);
      if (!page) break;
      offset += page.end;
      const parts = packetsOfPage(page, null).packets;
      if (pageIndex === 0) {
        const head = parts[0];
        if (!head) throw new SoundImportError('verify-failed', 'The file has no Opus header.');
        const read = readOpusHead(head);
        preSkip = read.preSkip;
        if (read.channels !== channels || read.mappingFamily !== 0) throw new SoundImportError('verify-failed', 'The header does not match what was encoded.');
        decoder.configure({ codec: 'opus', sampleRate: 48_000, numberOfChannels: channels, description: writeOpusHead(channels, 0) });
      } else if (pageIndex > 1) {
        finalGranule = page.granule;
        for (const packet of parts) {
          decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round((packetFrames * 1e6) / 48_000), data: packet }));
          packetFrames += opusPacketFrames(packet);
        }
        const share = offset / Math.max(1, file.size);
        if (share - shown >= PROGRESS_STEP) {
          shown = share;
          onProgress(share);
        }
        // Woken by the decoder as soon as it has room: a fixed sleep here once took half of a conversion.
        await queueRoom(() => decoder.decodeQueueSize, decoder);
      }
      pageIndex++;
    }
    if (decoder.state === 'configured') await decoder.flush();
  } catch (error) {
    if (error instanceof SoundImportError) throw error;
    throw new SoundImportError('verify-failed', error instanceof OggCorruptError ? error.message : `Reading it back failed: ${String(error)}`);
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }
  const failure = failures[0];
  if (failure) throw new SoundImportError('verify-failed', `Decoding it back failed: ${failure.message}`);
  if (finalGranule !== preSkip + frames) throw new SoundImportError('verify-failed', `The file ends at ${finalGranule}, not ${preSkip + frames}.`);
  if (total !== packetFrames) throw new SoundImportError('verify-failed', `Decoding it gave ${total} frames of ${packetFrames}.`);
  if (packetFrames < finalGranule) throw new SoundImportError('verify-failed', 'The file holds less audio than it says.');
}
