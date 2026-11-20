import { t } from '../../../i18n';
import { isKnownSystem, type LicenceId, type ListingKind, type ListingSystem, type TagGroupId, type TagId } from '../uploadContract';

/** The words a listing is described with, as the Armarium's share page names them. */

/** Where each licence's text is read; null for one that has no public text. */
export const LICENCE_URLS: Readonly<Record<LicenceId, string | null>> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-nc-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'all-rights-reserved': null,
};

export function kindLabel(kind: ListingKind): string {
  return t(`armariumListing.kind.${kind}`);
}

/** What a kind holds, in one line, for whoever chooses one. */
export function kindLine(kind: ListingKind): string {
  return t(`armariumListing.kindLine.${kind}`);
}

/** A game system's name: a known one's in the active language, a typed one as its creator wrote it; null names none. */
export function systemLabel(system: ListingSystem | null): string {
  if (system === null) return t('armariumListing.system.none');
  return isKnownSystem(system) ? t(`armariumListing.system.${system}`) : system;
}

export function licenceLabel(licence: LicenceId): string {
  return t(`armariumListing.licence.${licence}`);
}

/** What a licence lets other people do, in one line. */
export function licenceLine(licence: LicenceId): string {
  return t(`armariumListing.licenceLine.${licence}`);
}

export function tagGroupLabel(group: TagGroupId): string {
  return t(`armariumListing.tagGroup.${group}`);
}

export function tagLabel(tag: TagId): string {
  return t(`armariumListing.tag.${tag}`);
}
