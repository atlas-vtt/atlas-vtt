/** The template editor's menus on other targets (spec §5.4): empty card space, and a template from a newer Atlas. */

import { tidy, type SurfaceAction } from '../../interaction/surfaceActions';
import { shortcutText } from '../shortcutText';
import { t } from '../../../../i18n';

export interface EmptyCardInput {
  editable: boolean;
  canPaste: boolean;
  addAtEnd: () => void;
  pasteAtEnd: () => void;
}

/** A right-click on the card where no block is. */
export function emptyCardMenu(input: EmptyCardInput): SurfaceAction[] {
  return tidy([
    { kind: 'item', id: 'add-at-end', label: t('templateEditor.addAtEnd'), icon: 'plus', hint: '/', disabled: !input.editable, run: input.addAtEnd },
    ...(input.canPaste ? [{ kind: 'item', id: 'paste-at-end', label: t('templateEditor.pasteAtEnd'), icon: 'clipboard-paste', hint: shortcutText(['Mod'], 'V'), disabled: !input.editable, run: input.pasteAtEnd } satisfies SurfaceAction] : []),
  ]);
}

/** A template from a newer Atlas: the card renders, nothing changes it here. */
export function newerTemplateMenu(): SurfaceAction[] {
  return [{ kind: 'item', id: 'newer', label: t('templateEditor.newerTemplate'), disabled: true, run: () => undefined }];
}
