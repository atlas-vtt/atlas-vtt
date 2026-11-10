import type { TemplateId } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import { TEMPLATE_KEY } from '../../notes/statblockSource';
import { toFieldValue } from '../../values/fieldValueOf';
import type { FieldRecord } from '../../values/fieldValues';

/** The patch that makes a note name another template: `atlas-template` alone, no value touched. */
export function templateKeyPatch(record: FieldRecord, templateId: TemplateId): NotePatch {
  return { op: 'set', path: [TEMPLATE_KEY], base: toFieldValue(record[TEMPLATE_KEY]), next: templateId };
}
