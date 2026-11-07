/**
 * The template as text, for the editor's JSON view: what a typed text reads
 * as, in the parser's own sentences. A text is taken only where it is a whole
 * template of this Atlas with the id the session holds, and always with its
 * header (`withHeader`): a field it leaves out comes back, a block repeating
 * the header goes. Pure.
 */

import { parseTemplate } from '../../../format/parseTemplate';
import { serializeTemplate } from '../../../format/templateFormat';
import { withHeader } from '../../../model/headerDuplicates';
import type { StatblockTemplate, TemplateId } from '../../../model/templateTypes';
import { t } from '../../../../i18n';

export interface JsonReading {
  /** The template the text holds; null where it cannot be taken. */
  template: StatblockTemplate | null;
  /** Plain sentences: why it cannot be taken, or what was read around. */
  problems: string[];
}

/** Reads a typed text as the template `id`. */
export function readTemplateJson(text: string, id: TemplateId): JsonReading {
  const { template, status, problems } = parseTemplate(text);
  if (status !== 'ok' || !template) return { template: null, problems };
  if (template.id !== id) return { template: null, problems: [...problems, t('templateEditor.json.keepId', { id })] };
  const whole = withHeader(template);
  if (whole === template) return { template, problems };
  return { template: whole, problems: [...problems, t('templateEditor.json.header')] };
}

/** Whether a reading holds the same template as `text`, the file text of another. */
export function saysTheSame(reading: JsonReading, text: string): boolean {
  return reading.template !== null && serializeTemplate(reading.template) === text;
}
