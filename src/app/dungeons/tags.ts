/**
 * The tags a GM can ask a dungeon for. Ids are stored (settings, exports) and never
 * translated or renamed; what each does is shown through `t('dungeon.tag.<i18nKey>')`.
 */

import { idKey } from './idKey';

export const DUNGEON_TAGS = [
  'chaotic',
  'ordered',
  'colonnades',
  'compact',
  'winding',
  'cramped',
  'spacious',
  'crumbling',
  'deep',
  'flat',
  'dry',
  'wet',
  'flooded',
  'small',
  'medium',
  'large',
  'secret',
  'no-secrets',
  'round',
  'square',
  'string',
  'lava',
  'acid',
  'overgrown',
  'ruined',
  'inhabited',
] as const;

export type DungeonTag = (typeof DUNGEON_TAGS)[number];

/** How the panel groups the tags, each group under its own heading, in this order. Every tag is in one group. */
export const TAG_GROUPS: readonly { id: string; tags: readonly DungeonTag[] }[] = [
  { id: 'liquids', tags: ['dry', 'wet', 'flooded', 'lava', 'acid'] },
  { id: 'nature', tags: ['overgrown', 'crumbling', 'ruined', 'inhabited'] },
  { id: 'size', tags: ['small', 'medium', 'large'] },
  { id: 'layout', tags: ['compact', 'winding', 'cramped', 'spacious', 'chaotic', 'ordered', 'string', 'colonnades', 'round', 'square', 'deep', 'flat'] },
  { id: 'secrets', tags: ['secret', 'no-secrets'] },
];

/** The size tags, of which the wizard always has one. */
export const SIZE_TAGS: readonly DungeonTag[] = ['small', 'medium', 'large'];
/** The secret-room tags: none of them is the dungeon's usual share. */
export const SECRET_TAGS: readonly DungeonTag[] = ['no-secrets', 'secret'];

/** Tags that rule each other out: picking one drops the others of every group it is in. */
const EXCLUSIVE: readonly (readonly DungeonTag[])[] = [
  ['chaotic', 'ordered'],
  ['compact', 'winding'],
  ['cramped', 'spacious'],
  ['deep', 'flat'],
  ['dry', 'wet', 'flooded'],
  ['small', 'medium', 'large'],
  ['secret', 'no-secrets'],
  ['secret', 'string'],
  ['round', 'square'],
];

function isDungeonTag(value: string): value is DungeonTag {
  return (DUNGEON_TAGS as readonly string[]).includes(value);
}

/** The tags `tag` rules out. */
export function rivalsOf(tag: DungeonTag): DungeonTag[] {
  return EXCLUSIVE.filter((group) => group.includes(tag)).flatMap((group) => group.filter((t) => t !== tag));
}

/** `tags` with `tag` added and its rivals removed; later tags win over earlier ones. */
export function withTag(tags: readonly DungeonTag[], tag: DungeonTag): DungeonTag[] {
  const rivals = rivalsOf(tag);
  return [...tags.filter((t) => t !== tag && !rivals.includes(t)), tag];
}

/** Reads stored or typed tags: unknown ones are dropped, rivals resolved in order. */
export function readTags(values: readonly string[]): DungeonTag[] {
  return values.filter(isDungeonTag).reduce<DungeonTag[]>((tags, tag) => withTag(tags, tag), []);
}

/** The i18n key segment of a tag (`no-secrets` → `noSecrets`). */
export function tagKey(tag: DungeonTag): string {
  return idKey(tag);
}
