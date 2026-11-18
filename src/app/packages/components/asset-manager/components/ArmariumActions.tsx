import React from 'react';
import { CloudUpload, ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

interface ArmariumActionsProps {
  onReload: () => void;
  /** The page the store shows, which Open in browser opens. */
  page: string;
  /** Shares the selected collection in the Armarium. */
  onShare: () => void;
}

/** The header's actions while the Armarium is shown, where the library's search and Create stand. */
export function ArmariumActions({ onReload, page, onShare }: ArmariumActionsProps): React.JSX.Element {
  return (
    <div className="atlas-am-armarium-actions">
      <LabelTooltip label={t('armariumShare.shareSelected')}>
        <Button variant="ghost" size="icon" className="atlas-am-header-action" onClick={onShare}>
          <CloudUpload />
        </Button>
      </LabelTooltip>
      <LabelTooltip label={t('armarium.reload')}>
        <Button variant="ghost" size="icon" className="atlas-am-header-action" onClick={onReload}>
          <RotateCw />
        </Button>
      </LabelTooltip>
      <LabelTooltip label={t('armarium.openInBrowser')}>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-header-action"
          onClick={() => { window.open(page); }}
        >
          <ExternalLink />
        </Button>
      </LabelTooltip>
    </div>
  );
}
