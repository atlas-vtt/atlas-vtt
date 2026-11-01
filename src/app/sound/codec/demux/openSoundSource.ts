import { demuxAdts, looksLikeAdts } from './adtsDemux';
import { BlobWindow } from './blobWindow';
import { SoundImportError, type SoundSource } from './demuxTypes';
import { demuxFlac, isFlac } from './flacDemux';
import { demuxMp3, looksLikeMp3 } from './mp3Demux';
import { demuxMp4, isMp4 } from './mp4Demux';
import { demuxOgg, isOgg } from './oggDemux';
import { demuxWav, isWav } from './wavDemux';

const SNIFF_BYTES = 8192;

/** Goes by what the file's bytes are, never by its name or what anything claims it is. */
export async function openSoundSource(file: Blob): Promise<SoundSource> {
  const window = new BlobWindow(file);
  const head = await window.at(0, SNIFF_BYTES);
  if (isWav(head)) return demuxWav(window);
  if (isFlac(head)) return demuxFlac(window);
  if (isOgg(head)) return demuxOgg(window);
  if (isMp4(head)) return demuxMp4(window);
  if (looksLikeMp3(head)) return demuxMp3(window);
  if (looksLikeAdts(head)) return demuxAdts(window);
  throw new SoundImportError('unknown-format', 'The file is no audio format Atlas reads.');
}
