import React from 'react';
import { Eye, EyeOff, House } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useAtlasStore } from '../../ViewStoreContext';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';
import './roofs-toggle.scss';

/**
 * The GM's Roofs at the foot of the level switcher: hides the roofs from the GM's own picture of
 * this view, or shows them again. Never saved and never seen by players, whose roofs stay.
 */
export function RoofsToggle(): React.ReactElement {
  const hidden = useAtlasStore((state) => state.roofsHidden);
  const setRoofsHidden = useAtlasStore((state) => state.setRoofsHidden);
  return (
    <LabelTooltip side="right" label={t(hidden ? 'levels.roofsShow' : 'levels.roofsHide')}>
      <button
        type="button"
        className={cn('atlas-roofs-toggle', hidden && 'atlas-roofs-toggle--hidden')}
        aria-pressed={!hidden}
        onClick={() => setRoofsHidden(!hidden)}
      >
        <House size={12} aria-hidden="true" />
        <span className="atlas-roofs-toggle__name">{t('levels.roofs')}</span>
        {hidden ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
      </button>
    </LabelTooltip>
  );
}
