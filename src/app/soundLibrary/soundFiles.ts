/** Below a collection: the sounds' record files. */
export const SOUNDS_FOLDER = 'sounds';

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
