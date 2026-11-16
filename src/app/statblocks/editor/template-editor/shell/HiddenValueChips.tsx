import React from 'react';
import { EyeOff } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { hiddenHeaderParts } from '../../../model/templateHeader';
import type { StatblockTemplate } from '../../../model/templateTypes';
import { t } from '../../../../i18n';
import '../../panel-frame/folded-chips.scss';

export interface HiddenValueChipsProps {
  template: StatblockTemplate;
  editable: boolean;
  /** A chip was chosen: the part (by its block id) goes back on the card. */
  onShow: (blockId: string) => void;
}

/**
 * The header's parts the template hides as chips in the row under the card,
 * drawn as the note view draws its folded sections (`FoldedChips`), named as
 * the template names them; a click puts the part back on the card. Nothing
 * when the template hides none.
 */
export function HiddenValueChips({ template, editable, onShow }: HiddenValueChipsProps): React.JSX.Element | null {
  const hidden = hiddenHeaderParts(template);
  if (hidden.length === 0) return null;
  return (
    <div className="atlas-sb-folded" role="group" aria-label={t('templateEditor.hiddenParts')}>
      {hidden.map((part) => (
        <LabelTooltip key={part.id} label={t('templateEditor.hiddenPart', { name: part.label })} describe>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="atlas-sb-folded__chip"
            disabled={!editable}
            onClick={() => onShow(part.block.id)}
          >
            <EyeOff aria-hidden="true" />
            {part.label}
          </Button>
        </LabelTooltip>
      ))}
    </div>
  );
}
