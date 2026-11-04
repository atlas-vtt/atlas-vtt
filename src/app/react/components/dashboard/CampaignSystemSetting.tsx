import React, { useId, useState } from 'react';
import type { App } from 'obsidian';
import { AnimatePresence } from 'framer-motion';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { t } from '../../../i18n';
import { useSystemPresets } from '../../hooks/useSystemPresets';
import { campaignSystemName } from './campaignSystemName';
import { useDiceSets } from '../../hooks/useDiceSets';
import { CampaignRulesDialog } from './CampaignRulesDialog';
import { GameIcon } from '../GameIcon';
import { DASHBOARD_ICON_PATHS } from '../../../types/dashboardIconPaths';

interface CampaignSystemSettingProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  disabled: boolean;
}

/** The campaign's game system on its page: its name, on the button that opens its settings. */
export function CampaignSystemSetting({ app, campaign, service, disabled }: CampaignSystemSettingProps): React.JSX.Element {
  const headingId = useId();
  const { presets } = useSystemPresets(app);
  const { sets } = useDiceSets(app);
  const [isOpen, setIsOpen] = useState(false);
  const shown = campaign.system ? campaignSystemName(campaign.system, presets, sets) : null;

  return (
    <section className="campaign-system" aria-labelledby={headingId}>
      <h2 id={headingId} className="panel-heading">{t('campaign.gameSystem')}</h2>
      <button
        type="button"
        className="campaign-system__trigger"
        aria-labelledby={headingId}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        <span className={shown ? 'campaign-system__name' : 'campaign-system__name is-empty'}>{shown?.name ?? t('csm.system.none')}</span>
        {shown?.edited && <span className="atlas-csm-tag atlas-csm-tag--accent">{t('csm.system.edited')}</span>}
        <GameIcon path={DASHBOARD_ICON_PATHS['rule-book']} className="campaign-system__icon" />
      </button>
      <AnimatePresence>
        {isOpen && <CampaignRulesDialog app={app} campaign={campaign} service={service} onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}
