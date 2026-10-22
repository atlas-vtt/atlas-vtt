import { type App } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { copyTemplate } from '../../library/templateActions';
import type { TemplateId } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import type { PaneServices } from '../paneServices';
import { templateKeyPatch } from './templateKeyPatch';

/**
 * "Duplicate template" (§5.5, §9.1): a copy of the note's template that this
 * statblock then uses, for a variant such as a Colossus; the copy opens in the
 * template editor to be changed. Atlas never makes such a copy on
 * its own. The copy offers the original's recovery buttons, which its file
 * holds. Resolves with the copy, or null when it could not be made or used.
 */
export async function duplicateTemplate(
  app: App, writer: PaneServices['writer'], notePath: string, record: FieldRecord, templateId: TemplateId,
): Promise<{ id: TemplateId; path: string } | null> {
  try {
    const copy = await copyTemplate(app, templateId);
    const outcome = await writer.write(notePath, [templateKeyPatch(record, copy.id)]);
    if (outcome.problem || outcome.conflicts.length) {
      showNotice('The copy is there, but this statblock could not switch to it.');
      return null;
    }
    return copy;
  } catch (error) {
    console.error('[Atlas] Duplicating a template failed:', error);
    showNotice("Couldn't duplicate the template.");
    return null;
  }
}
