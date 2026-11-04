/**
 * What "New statblock…" offers (spec §12.2, E1): the template open in the
 * editor first, then the kinds of statblock the collection starts (its roles,
 * each with the template it starts from), then the vault's templates, the
 * one changed last first, then the built-ins. Pure.
 */

import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { TemplateId } from '../../model/templateTypes';
import { t } from '../../../i18n';

export interface TemplateOffer {
  templateId: TemplateId;
  /** The role it stands for, whose folder the note goes into. */
  roleId?: string | undefined;
  label: string;
  /** Muted beside it: the template a role starts from, or where a template comes from. */
  detail: string;
}

export interface OffersInput {
  /** The collection's roles, each with the template it starts from. */
  roles: ReadonlyArray<{ roleId: string; name: string; templateId: TemplateId; templateName: string }>;
  templates: readonly LibraryTemplate[];
  /** The template the editor shows (the command ran from it): offered first. */
  preferred: TemplateId | null;
  /** When a vault template's file changed last, for the order. */
  changedAt: (template: LibraryTemplate) => number;
}

export function templateOffers({ roles, templates, preferred, changedAt }: OffersInput): TemplateOffer[] {
  const byId = new Map(templates.map((entry) => [entry.template.id, entry]));
  const offers: TemplateOffer[] = [];
  const preferredEntry = preferred ? byId.get(preferred) : undefined;
  if (preferredEntry) offers.push({ templateId: preferredEntry.template.id, label: preferredEntry.name, detail: t('statblockEditor.offer.editing') });
  for (const role of roles) offers.push({ templateId: role.templateId, roleId: role.roleId, label: role.name, detail: role.templateName });
  const taken = new Set(offers.map((offer) => offer.templateId));
  const vault = templates.filter((entry) => !entry.builtIn && entry.status === 'ok' && !taken.has(entry.template.id))
    .sort((a, b) => changedAt(b) - changedAt(a));
  for (const entry of vault) offers.push({ templateId: entry.template.id, label: entry.name, detail: t('statblockEditor.offer.yours') });
  for (const entry of templates.filter((candidate) => candidate.builtIn && !taken.has(candidate.template.id))) {
    offers.push({ templateId: entry.template.id, label: entry.name, detail: t('statblockEditor.builtIn') });
  }
  return offers;
}

/** The offers whose name or detail holds every word typed. */
export function findOffers(offers: readonly TemplateOffer[], query: string): TemplateOffer[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return offers.filter((offer) => words.every((word) => `${offer.label} ${offer.detail}`.toLowerCase().includes(word)));
}
