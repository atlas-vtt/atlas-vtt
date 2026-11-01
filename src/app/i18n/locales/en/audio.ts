import type { Message } from '../../types';

export const audio = {
  'audio.title': 'Sound Source',
  'audio.sound': 'Sound',
  'audio.preview': 'Preview sound',
  'audio.volume': 'Volume',
  'audio.range': 'Range',
  'audio.loop': 'Loop',

  'audio.experimental.label': 'Sound',
  'audio.experimental.hint': 'Music and ambience from your vault: the Sounds tab of the asset manager. While off, the tab stays hidden.',

  'audio.tab': 'Sounds',
  'audio.tags': 'Sound tags',
  'audio.reviewKind': 'Sound',
  'audio.empty': 'Drop audio files here, or add them with the + button.',

  'audio.add': 'Add sounds',
  'audio.addFromVault': 'Add sounds from vault',
  'audio.pickPlaceholder': 'Pick an audio file or a folder',
  'audio.pickFolder': { one: '{count} file', other: '{count} files' },
  'audio.pickNone': 'Every audio file in the vault is already here.',
  'audio.importing': 'Adding sounds: {done} of {total}',
  'audio.added': { one: 'Added {count} sound.', other: 'Added {count} sounds.' },
  'audio.notAudio': 'Not audio: {files}.',
  'audio.couldNotAdd': 'Could not add {files}.',

  'audio.offer': { one: "Add {count} file from this collection's music folder", other: "Add {count} files from this collection's music folder" },
  'audio.offerAdd': 'Add',
  'audio.offerDismiss': 'Not now',

  'audio.state.missing': 'Waiting for the file',
  'audio.state.notConverted': 'Not converted',
  'audio.state.converting': 'Converting',
  'audio.state.convertingPercent': 'Converting {percent}%',
  'audio.state.ready': 'Ready',

  'audio.kind': 'Kind',
  'audio.kind.music': 'Music',
  'audio.kind.ambience': 'Ambience',
  'audio.trim': 'Trim',
  'audio.trimValue': '{value} dB',
  'audio.licence': 'Licence',
  'audio.licence.unknown': 'Unknown',
  'audio.licence.cc0': 'CC0',
  'audio.licence.ccBy': 'CC BY',
  'audio.licence.other': 'Other',
  'audio.credit': 'Credit',
  'audio.creditTitle': 'Credit for {name}',
  'audio.creditPlaceholder': 'Who made it',
} as const satisfies Record<string, Message>;
