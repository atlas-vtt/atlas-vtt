/**
 * Kind of value, from a Value tile's toolbar: the kinds it may hold, with a
 * tick on the one in use. A choice adds its switches (several at once, a
 * number with each) and "Choices…", which opens the tile's Options at its
 * choices; turning a property without choices into one opens them at once.
 * Each change is one session step.
 */

import { updateField, type FieldChanges } from '../../../model/fieldOps';
import type { TemplateBlock, TemplateField } from '../../../model/templateTypes';
import { SEPARATOR, type SurfaceAction } from '../../interaction/surfaceActions';
import { CHOICES_FOCUS_KEY } from '../inspector/ChoiceSettings';
import { VALUE_KINDS, valueKindOf, withValueKind } from '../options/valueKinds';
import type { EditorSession } from '../sessionTypes';
import { t } from '../../../../i18n';

export interface ValueKindContext {
  session: EditorSession;
  block: TemplateBlock;
  field: TemplateField;
  editable: boolean;
  /** Opens the tile's Options, focusing the input named `focusKey`. */
  openOptions: (focusKey?: string) => void;
}

function item(id: string, label: string, run: () => void, extra: Partial<Extract<SurfaceAction, { kind: 'item' }>> = {}): SurfaceAction {
  return { kind: 'item', id, label, run, ...extra };
}

export function valueKindMenu({ session, block, field, editable, openOptions }: ValueKindContext): SurfaceAction[] {
  const kind = valueKindOf(block, field);
  const edit = (changes: FieldChanges): void => session.apply((template) => updateField(template, field.key, changes));
  const kinds = VALUE_KINDS.map((entry) => item(`kind-${entry.kind}`, entry.label, () => {
    session.apply((template) => withValueKind(template, block.id, entry.kind));
    if (entry.kind === 'choice' && !field.options?.length) openOptions(CHOICES_FOCUS_KEY);
  }, { checked: kind === entry.kind, disabled: !editable }));
  if (kind !== 'choice') return kinds;
  return [
    ...kinds,
    SEPARATOR,
    item('pick-several', t('templateEditor.pickSeveral'), () => edit({ several: field.several ? undefined : true }), { checked: field.several === true, disabled: !editable }),
    item('each-with-number', t('templateEditor.eachWithNumber'), () => edit({ numbered: field.numbered ? undefined : true }), { checked: field.numbered === true, disabled: !editable }),
    SEPARATOR,
    item('edit-choices', t('templateEditor.choicesMenu'), () => openOptions(CHOICES_FOCUS_KEY), { icon: 'list' }),
  ];
}
