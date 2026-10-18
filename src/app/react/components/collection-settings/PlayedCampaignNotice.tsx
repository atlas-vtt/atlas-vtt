import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { t } from '../../../i18n';

interface PlayedCampaignNoticeProps {
  campaignName: string;
  /** Opens the played campaign's game system. */
  onEdit: () => void;
}

/** Says, over a collection's rules, that the played campaign's game system applies in their place. */
export function PlayedCampaignNotice({ campaignName, onEdit }: PlayedCampaignNoticeProps): React.ReactElement {
  return (
    <div className="atlas-csm-played-notice" role="note">
      <span className="atlas-csm-played-notice__text">{t('csm.playedCampaign', { name: campaignName })}</span>
      <Button variant="ghost" className="atlas-csm-played-notice__action" onClick={onEdit}>
        {t('csm.playedCampaignEdit')}
      </Button>
    </div>
  );
}
