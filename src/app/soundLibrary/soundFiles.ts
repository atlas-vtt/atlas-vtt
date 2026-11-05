import { ATLAS_VTT_DIR } from '../services/assetPaths';

export const SOUNDS_DIR = `${ATLAS_VTT_DIR}/sounds`;

/** One JSON per mood: Atlas' own folder, the GM's for the whole vault, never audio and never a root. */
export const MOODS_FOLDER = `${SOUNDS_DIR}/moods`;

/** One JSON per sound in use, beside the default import folders, as the moods are. */
export const RECORDS_FOLDER = `${SOUNDS_DIR}/records`;

/** Whether a vault path lies in Atlas' own folders for moods and records. */
export const isSoundDataPath = (path: string): boolean =>
  [MOODS_FOLDER, RECORDS_FOLDER].some((folder) => path === folder || path.startsWith(`${folder}/`));

/**
 * Atlas' own folder holds video maps and record files, never the GM's library, but for what lies in its `sounds`
 * besides moods and records: the default folders. The two folders above those hold everything else, so they are
 * Atlas' own too, also for a root above them.
 */
export const isAtlasOwn = (path: string): boolean =>
  path === ATLAS_VTT_DIR || path === SOUNDS_DIR || isSoundDataPath(path) || (path.startsWith(`${ATLAS_VTT_DIR}/`) && !path.startsWith(`${SOUNDS_DIR}/`));

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set(['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'webm']);

/** What a file picker offers: the extensions, since the system knows no type for some of them. */
export const AUDIO_ACCEPT = [...AUDIO_EXTENSIONS].map((extension) => `.${extension}`).join(',');

/** Whether a file counts as audio, by its name. A WebM may be a video, which the caller tells by what already owns the file. */
export function isAudioPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && AUDIO_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/** Whether a drag may carry audio: a drag names only types, and the browser knows none for some of these files. */
export function mayCarryAudio(transfer: Pick<DataTransfer, 'items'>): boolean {
  return Array.from(transfer.items).some((item) => item.kind === 'file'
    && (item.type === '' || item.type.startsWith('audio/') || item.type === 'video/webm' || item.type === 'application/ogg'));
}
