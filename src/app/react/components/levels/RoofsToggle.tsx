import React from 'react';
import { Eye, EyeOff, House } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useAtlasStore } from '../../ViewStoreContext';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t, type MessageKey } from '../../../i18n';
import './roofs-toggle.scss';

function roofsLabel(sessionView: boolean, hidden: boolean): MessageKey {
  if (sessionView) return 'levels.roofsInSession';
  return hidden ? 'levels.roofsShow' : 'levels.roofsHide';
}

/**
 * The GM's Roofs at the foot of the level switcher: hides the roofs from the GM's own picture of
 * this view, or shows them again. Never saved and never seen by players, whose roofs stay: while
 * the canvas shows the players' view (session view) it has nothing to hide, so it stands disabled.
 */
export function RoofsToggle(): React.ReactElement {
  const hidden = useAtlasStore((state) => state.roofsHidden);
  const setRoofsHidden = useAtlasStore((state) => state.setRoofsHidden);
  const sessionView = useAtlasStore((state) => !state.isGMView);
  const shown = sessionView || !hidden;
  return (
    <LabelTooltip side="right" multiline label={t(roofsLabel(sessionView, hidden))}>
      <button
        type="button"
        className={cn('atlas-roofs-toggle', !shown && 'atlas-roofs-toggle--hidden')}
        aria-pressed={shown}
        aria-disabled={sessionView || undefined}
        onClick={sessionView ? undefined : () => setRoofsHidden(!hidden)}
      >
        <House size={12} aria-hidden="true" />
        <span className="atlas-roofs-toggle__name">{t('levels.roofs')}</span>
        {shown ? <Eye size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />}
      </button>
    </LabelTooltip>
  );
}
