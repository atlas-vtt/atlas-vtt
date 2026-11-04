/**
 * A Metric tile's own edits through the session: a number added at its end or
 * one taken out, each one undo step that keeps the tile selected and says
 * what it did.
 */

import { UNNAMED_NUMBER } from '../../render/blocks/MetricView';
import { fieldByKey } from '../../model/fieldKeys';
import { MAX_METRIC_NUMBERS, addMetricNumber, canAddMetricNumber, metricBlock, removeMetricNumber } from '../../model/metricNumbers';
import type { StatblockTemplate } from '../../model/templateTypes';
import { removedMessage } from '../statblock-pane/announcements';
import { editTile, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';
import { t } from '../../../i18n';

/** Why a Metric takes no more numbers. */
export const METRIC_FULL = t('templateEditor.metricFull', { count: MAX_METRIC_NUMBERS });

/** What a number of a Metric is called: its field's label, else "Number" while it has none. */
export function metricNumberName(template: StatblockTemplate, blockId: string, index: number): string {
  const key = metricBlock(template, blockId)?.fields[index];
  return key ? (fieldByKey(template.fields, key)?.label || key) : UNNAMED_NUMBER;
}

/** One more number at the Metric's end (up to six), not named yet: its label is named on the card. */
export function addNumber(session: EditorSession, blockId: string): EditOutcome {
  const template = session.getSnapshot().template;
  if (metricBlock(template, blockId) && !canAddMetricNumber(template, blockId) && !session.getSnapshot().readOnly) {
    return { announce: `${METRIC_FULL}.` };
  }
  return editTile(session, blockId, (now) => addMetricNumber(now, blockId), { announce: t('templateEditor.numberAdded') });
}

/** The Metric without its number at `index`; its last number goes only with the tile. The number's property stays in the template. */
export function removeNumber(session: EditorSession, blockId: string, index: number): EditOutcome {
  const name = metricNumberName(session.getSnapshot().template, blockId, index);
  return editTile(session, blockId, (template) => removeMetricNumber(template, blockId, index), { announce: removedMessage(name, 'Removed'), deleted: name });
}
