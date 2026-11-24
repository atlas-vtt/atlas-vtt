import { t } from '../../i18n';
import type { MessageKey } from '../../i18n/types';
import type { ItemKind } from '../../services/itemBundle/itemBundleFormat';
import type { ShareSnapshot } from '../upload/shareState';

/**
 * The sentences of a share that name a collection, each with its wording for a single Atlas file, which says "it" and
 * "the file" in its place: one sentence per subject, never a noun put into a sentence.
 */
const ITEM_WORDING = {
  'armariumShare.signInWhy': 'armariumShare.signInWhyItem',
  'armariumShare.title.upload': 'armariumShare.title.uploadItem',
  'armariumShare.packing': 'armariumShare.packingItem',
  'armariumShare.exportFailed': 'armariumShare.exportItemFailed',
  'armariumShare.rejected': 'armariumShare.rejectedItem',
  'armariumShare.fixThenShare': 'armariumShare.fixThenShareItem',
  'armariumShare.listingIntro': 'armariumShare.listingIntroItem',
  'armariumShare.descriptionHint': 'armariumShare.descriptionHintItem',
  'armariumShare.creditsHint': 'armariumShare.creditsHintItem',
  'armariumShare.leaveBody': 'armariumShare.leaveBodyItem',
} as const;

export type SubjectSentence = keyof typeof ITEM_WORDING;

/** Music is said as a single file is ("it"), but where a sentence names the file or where its name comes from. */
const MUSIC_WORDING: Readonly<Record<SubjectSentence, MessageKey>> = {
  ...ITEM_WORDING,
  'armariumShare.rejected': 'armariumMusic.rejected',
  'armariumShare.listingIntro': 'armariumMusic.listingIntro',
};

/** A sentence of the share in the words of what it shares. */
export function shareSaid(subject: ShareSnapshot['subject'], key: SubjectSentence, values?: Readonly<Record<string, string | number>>): string {
  if (subject === 'music') return t(MUSIC_WORDING[key], values);
  return t(subject === 'item' ? ITEM_WORDING[key] : key, values);
}

/** A kind of item, as one of them is called: "Statblock template". */
export function itemKindLabel(kind: ItemKind): string {
  return t(`armariumShare.itemKind.${kind}`);
}
