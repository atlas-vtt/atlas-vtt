import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import type { CreatorMode, TokenPreview } from './types';

/** What a background conversion produced: a framed token's default crop, or the whole image. */
export type PreviewConversionKind = 'default-crop' | 'whole';

/** A finished background conversion, kept with its preview so saving does not convert the image again. */
export interface KeptConversion {
  result: Promise<ProcessedImage | undefined>;
  kind: PreviewConversionKind;
}

/** The images a creator held when it closed without saving them. */
export interface CreatorDraft {
  previews: readonly TokenPreview[];
  defaultRing: boolean;
  conversions: ReadonlyMap<string, KeptConversion>;
}

/** The creator's own choices: the collection picked in it (for the collection it was opened in) and the statblock role. */
export interface CreatorSettings {
  collection?: { openedFor: string; chosen: string };
  statblockRoleId?: string | null;
}

// A creator closed by Escape, its × or the backdrop keeps its work for the session: reopening shows it as it was left.
// Only saving it or Discard clears it.
const drafts = new Map<CreatorMode, CreatorDraft>();
const settings = new Map<CreatorMode, CreatorSettings>();

function revokePreviews(previews: readonly TokenPreview[]): void {
  for (const preview of previews) if (preview.previewUrl.startsWith('blob:')) URL.revokeObjectURL(preview.previewUrl);
}

/** The draft a creator of this kind left, if any. */
export function creatorDraft(mode: CreatorMode): CreatorDraft | undefined {
  return drafts.get(mode);
}

/** Keeps what a closing creator holds; a creator closing empty leaves no draft. */
export function keepCreatorDraft(mode: CreatorMode, draft: CreatorDraft): void {
  if (draft.previews.length === 0) drafts.delete(mode);
  else drafts.set(mode, draft);
}

/** Forgets the draft without revoking its images: a creator that opened with it holds them now. */
export function forgetCreatorDraft(mode: CreatorMode): void {
  drafts.delete(mode);
}

export function creatorSettings(mode: CreatorMode): CreatorSettings {
  return settings.get(mode) ?? {};
}

export function keepCreatorSettings(mode: CreatorMode, patch: CreatorSettings): void {
  settings.set(mode, { ...settings.get(mode), ...patch });
}

/** The collection a creator opened in `openedFor` starts on: the one picked in it last time it opened there. */
export function rememberedCollection(mode: CreatorMode, openedFor: string): string {
  const remembered = settings.get(mode)?.collection;
  return remembered?.openedFor === openedFor ? remembered.chosen : openedFor;
}

/** Discard: drops the draft and the creator's choices, and gives back the images' memory. */
export function discardCreatorDraft(mode: CreatorMode): void {
  const draft = drafts.get(mode);
  if (draft) revokePreviews(draft.previews);
  drafts.delete(mode);
  settings.delete(mode);
}

/** Every creator's draft, as when Atlas unloads. */
export function discardCreatorDrafts(): void {
  for (const mode of [...drafts.keys()]) discardCreatorDraft(mode);
  settings.clear();
}
