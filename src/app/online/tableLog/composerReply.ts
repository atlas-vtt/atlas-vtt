import type { TablePerson } from '../protocol/index.ts';
import { audienceNames, audienceOf } from './audience.ts';
import type { ComposerProps } from './Composer.tsx';
import { shownName } from './logAuthors.ts';
import type { ShownEntry } from './LogState.ts';
import { isThreadable } from './logThreads.ts';

/** The entry of `id` where the viewer holds it and can answer it: a chat message, a roll, an image, a loot card or a found note. */
export function answerable(entries: readonly ShownEntry[], id: string | null): ShownEntry | undefined {
  return id === null ? undefined : entries.find((entry) => entry.id === id && isThreadable(entry));
}

/**
 * What the message field says of the entry it answers: who it answers and whom the answer is
 * whispered to. A thread's root (`root`) is answered without saying so, unless the answer is whispered.
 */
export function composerReply(replied: ShownEntry | undefined, root: string | null, self: string | null, people: readonly TablePerson[]): ComposerProps['reply'] {
  if (replied === undefined) return null;
  const audience = audienceOf(replied, self);
  const whisper = audience === null || audience.length === 0 ? null : `Whispering to ${audienceNames(audience, people, self)}`;
  if (replied.id === root) return { id: replied.id, label: 'Replying in thread', whisper, thread: true };
  const label = replied.who === self ? 'Replying to yourself' : `Replying to ${shownName(replied.who, replied.name, self)}`;
  return { id: replied.id, label, whisper };
}
