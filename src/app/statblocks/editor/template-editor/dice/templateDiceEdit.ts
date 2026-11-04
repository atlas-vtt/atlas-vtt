/** The dice set a template's statblocks roll a bare bonus with, as one edit of the template. */

import type { StatblockTemplate } from '../../../model/templateTypes';
import { applyEdit } from '../sessionEdit';
import type { EditorSession } from '../sessionTypes';

/** The template rolling with the set `id`; with none, the collection's dice again (the key goes). */
export function withDiceSet(template: StatblockTemplate, id: string | null): StatblockTemplate {
  if ((template.diceSetId ?? null) === id) return template;
  const { diceSetId: _previous, ...rest } = template;
  return id === null ? rest : { ...rest, diceSetId: id };
}

/** Picks the template's dice set, one undo step; false where the session took no edit (read-only). */
export function setTemplateDiceSet(session: EditorSession, id: string | null): boolean {
  return applyEdit(session, (template) => ({ template: withDiceSet(template, id), result: true })) ?? false;
}
