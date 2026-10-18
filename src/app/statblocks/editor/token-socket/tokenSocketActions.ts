/**
 * What the token socket's panel does to the note and its links. Links go
 * through `TokenStatblockLinkService`, as the asset manager's do: a statblock
 * may be linked by many tokens, each token links one statblock. It writes
 * the note's `image` through `NoteFieldWriter` and updates the tokens on
 * every map. Art chosen without a token is written through the pane, as any
 * value it edits.
 */

import type { TFile, App } from 'obsidian';
import type { TokenAsset } from '../../../services/AssetService';
import { imageSrc } from '../../../utils/imageSource';
import { TokenStatblockLinkService } from '../../../services/TokenStatblockLinkService';
import { setTokenRing } from '../../../services/tokenRingSync';
import { linkedTokenArt, statblockImageFile, statblockImageSrc, statblockImageToken } from '../../render/shared/statblockImage';
import type { TemplateField } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import type { PaneEditController } from '../statblock-pane/paneEditContext';
import { fieldPatches } from '../statblock-pane/valuePatches';
import type { CardToken } from './useNoteTokens';
import { isVaultImage } from '../../../utils/vaultImage';

/** The key Fantasy Statblocks reads the art from, which the link service writes. */
const LINK_IMAGE_KEY = 'image';

/** The address the art of `field` shows from now; '' when the note names none, or none the vault holds. */
export function artSrc(pane: PaneEditController, field: TemplateField): string {
  return statblockImageSrc(pane.app, valueText(pane.read(field).value), pane.notePath);
}

/** Whether the note's art is the token's own: the token marked as the statblock's image. */
export function isTheArt(app: App, token: CardToken, art: string): boolean {
  if (!art || !token.imagePath) return false;
  return imageSrc(app, token.imagePath) === art;
}

/** The vault image the note's art names, which a token can be made from; null for none or a web address. */
export function artFile(pane: PaneEditController, field: TemplateField): TFile | null {
  const file = statblockImageFile(pane.app, valueText(pane.read(field).value), pane.notePath);
  return file && isVaultImage(file) ? file : null;
}

/** The token whose art the note's art is: the token the panel's Ring switch frames; null for art of no token. */
export function artToken(pane: PaneEditController, field: TemplateField): TokenAsset | null {
  return statblockImageToken(pane.app, valueText(pane.read(field).value), pane.notePath);
}

/** What the socket shows: the note's art, else (none, or a file the vault no longer holds) its first linked token's. */
export interface ShownArt {
  /** '' for nothing to show. */
  src: string;
  /** The token the art is, whose ring the panel's switch sets; null for art of no token. */
  token: TokenAsset | null;
}

export function shownArt(pane: PaneEditController, field: TemplateField): ShownArt {
  const own = artSrc(pane, field);
  if (own) return { src: own, token: artToken(pane, field) };
  const linked = linkedTokenArt(pane.app, pane.notePath);
  return linked ?? { src: '', token: null };
}

/** Frames the token, and every token placed with its art, with the ring or without. */
export async function setRing(pane: PaneEditController, token: TokenAsset, showRing: boolean): Promise<void> {
  await setTokenRing(pane.app, token, showRing);
  pane.announce(showRing ? `${token.name} has a ring.` : `${token.name} has no ring.`);
}

/** Writes `path` as the note's art: one step of the note's history, as any value the pane edits. */
export async function setArt(pane: PaneEditController, field: TemplateField, path: string): Promise<void> {
  const read = pane.read(field);
  await pane.write(field, fieldPatches(field.key, read, path), { base: read.value, mine: path });
}

/**
 * Links the token to the note, beside any token linked already. Its art
 * becomes the note's picture only where the note has none that shows (the
 * link service writes `image`; a template that keeps its art under another
 * key gets it there); a picture that shows stays, and "Use its art" swaps it.
 * The panel shows the link, so the service announces only a token it moved
 * from another statblock.
 */
export async function linkToken(pane: PaneEditController, field: TemplateField, token: CardToken): Promise<boolean> {
  if (!token.imagePath) return false;
  const hadArt = artSrc(pane, field) !== '';
  const linked = await TokenStatblockLinkService.getInstance(pane.app).linkTokenToStatblock(token.imagePath, pane.notePath, {
    updateStatblockAvatar: true,
    notice: false,
  });
  if (linked && !hadArt && field.key !== LINK_IMAGE_KEY) await setArt(pane, field, token.imagePath);
  return linked;
}

/** Unlinks the token; the note's `image` goes with it where it was the token's art. */
export async function unlinkToken(app: App, token: CardToken): Promise<boolean> {
  if (!token.imagePath) return false;
  return TokenStatblockLinkService.getInstance(app).unlinkToken(token.imagePath, { updateStatblockAvatar: true });
}

/** Makes a token of the note's art in the pane's collection and links it, as "Create token from statblock image" does. */
export async function makeToken(pane: PaneEditController, collectionId: string): Promise<boolean> {
  const made = await TokenStatblockLinkService.getInstance(pane.app).createTokenFromStatblockImage(pane.notePath, collectionId);
  return made !== null;
}
