import React from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { ARMARIUM_PAGE_URL } from '../../../../armarium/armariumUrls';
import { t } from '../../../../i18n';

/** The header's actions while the Armarium is shown, where the library's search and Create stand. */
export function ArmariumActions({ onReload }: { onReload: () => void }): React.JSX.Element {
  return (
    <div className="atlas-am-armarium-actions">
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
          onClick={() => { window.open(ARMARIUM_PAGE_URL); }}
        >
          <ExternalLink />
        </Button>
      </LabelTooltip>
    </div>
  );
}
