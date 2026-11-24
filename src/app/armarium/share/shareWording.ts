import { t } from '../../i18n';
import type { MessageKey, MessageValues } from '../../i18n/types';
import type { ItemKind } from '../../services/itemBundle/itemBundleFormat';
import type { Refusal, ShareSnapshot } from '../upload/shareState';
import { findingMessage } from '../upload/text/findingMessages';
import { stageLabel, uploadMessageFor, type UploadContext } from '../upload/text/uploadMessages';
import { CHECK_STAGES, type CheckFinding, type CheckStage } from '../upload/uploadContract';
import { ITEM_FINDINGS, MUSIC_FINDINGS } from './findingWording';

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
  'armariumUpload.refusal.signed-out': 'armariumUpload.item.signed-out',
  'armariumUpload.refusal.restricted': 'armariumUpload.item.restricted',
  'armariumUpload.refusal.restrictedUntil': 'armariumUpload.item.restrictedUntil',
  'armariumUpload.refusal.terms': 'armariumUpload.item.terms',
  'armariumUpload.refusal.needs-linked-provider': 'armariumUpload.item.needs-linked-provider',
  'armariumUpload.error.not-found': 'armariumUpload.item.not-found',
  'armariumUpload.error.upload-expired': 'armariumUpload.item.upload-expired',
  'armariumUpload.error.upload-corrupt': 'armariumUpload.item.upload-corrupt',
  'armariumUpload.error.upload-gone': 'armariumUpload.item.upload-gone',
  'armariumUpload.error.wrong-state': 'armariumUpload.item.wrong-state',
  'armariumUpload.error.declaration-missing': 'armariumUpload.item.declaration-missing',
  'armariumUpload.error.listing-not-yours': 'armariumUpload.item.listing-not-yours',
  'armariumUpload.error.listing-removed': 'armariumUpload.item.listing-removed',
  'armariumUpload.error.check-files-invalid': 'armariumUpload.item.check-files-invalid',
} as const;

export type SubjectSentence = keyof typeof ITEM_WORDING;

/**
 * Music is said as a single file is ("it"), but where a sentence names the file, where its name comes from, or the
 * vault, which need not hold it.
 */
const MUSIC_WORDING: Readonly<Record<SubjectSentence, MessageKey>> = {
  ...ITEM_WORDING,
  'armariumShare.rejected': 'armariumMusic.rejected',
  'armariumShare.fixThenShare': 'armariumMusic.fixThenShare',
  'armariumShare.listingIntro': 'armariumMusic.listingIntro',
  'armariumUpload.error.declaration-missing': 'armariumMusic.declarationMissing',
};

const WORDING: Readonly<Record<ShareSnapshot['subject'], Readonly<Partial<Record<MessageKey, MessageKey>>>>> = {
  collection: {},
  item: { ...ITEM_WORDING, ...ITEM_FINDINGS },
  music: { ...MUSIC_WORDING, ...MUSIC_FINDINGS },
};

/** A sentence in the words of what is shared: its own where the collection's names a collection, else that one. */
function said(subject: ShareSnapshot['subject'], key: MessageKey, values?: MessageValues): string {
  return t(WORDING[subject][key] ?? key, values);
}

/** A sentence of the share in the words of what it shares. */
export function shareSaid(subject: ShareSnapshot['subject'], key: SubjectSentence, values?: MessageValues): string {
  return said(subject, key, values);
}

/** What a refusal or error of the upload and publish routes says, in the words of what is shared. */
export function refusalSaid(subject: ShareSnapshot['subject'], { code, until }: Refusal, context: UploadContext = 'share'): string {
  return uploadMessageFor(code, until, context, (key, values) => said(subject, key, values));
}

/** Why packing failed: for music what Atlas could not read in its own words (the engine's are in the console), else the error's. */
export function packingFailureSaid(subject: ShareSnapshot['subject'], { detail, unreadable }: Refusal): string {
  if (subject !== 'music') return shareSaid(subject, 'armariumShare.exportFailed', { error: detail ?? '' });
  if (unreadable?.part === 'cover') return t('armariumMusic.packFailed.cover');
  if (unreadable?.part === 'track') return t('armariumMusic.packFailed.track', { title: unreadable.title });
  return t('armariumMusic.packFailed.other');
}

/** What a finding of the checks says, in the words of what is shared. */
export function findingSaid(subject: ShareSnapshot['subject'], finding: CheckFinding): string {
  return findingMessage(finding, (key, values) => said(subject, key, values));
}

/** A kind of item, as one of them is called: "Statblock template". */
export function itemKindLabel(kind: ItemKind): string {
  return t(`armariumShare.itemKind.${kind}`);
}

/** The stages of a check that do something for music: it brings no scenes, notes, loot bases or links between files. */
const MUSIC_STAGES: readonly CheckStage[] = ['archive', 'manifest', 'images', 'rebuild', 'outputs'];

/** The stages of a check a share lists, in their order: those that apply to what it shares. */
export function stagesOf(subject: ShareSnapshot['subject']): readonly CheckStage[] {
  return subject === 'music' ? MUSIC_STAGES : CHECK_STAGES;
}

/** A stage of a check as the share names it: for music, the pictures' stage reads its tracks too. */
export function stageSaid(subject: ShareSnapshot['subject'], stage: CheckStage): string {
  return subject === 'music' && stage === 'images' ? t('armariumMusic.stage.images') : stageLabel(stage);
}
