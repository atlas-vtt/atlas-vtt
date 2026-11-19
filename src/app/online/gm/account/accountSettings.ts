import type { AtlasSettingSection } from '../../../settings/settingSections';
import type { AccountControl } from './AccountControl.ts';
import { accessText, accountText, planText, UNREACHABLE_TEXT, type AccountView } from './accountView.ts';
import { t } from '../../../i18n';
import { addSettingButton } from '../../../ui/atlasButton';

/** What the account row says. */
function accountDesc(view: AccountView): string {
  switch (view.kind) {
    case 'waiting': return t('online.account.approve');
    case 'checking': return t('online.account.checking');
    case 'unreachable': return UNREACHABLE_TEXT;
    case 'no-access': return t('online.account.signedInNoAccess', { account: accountText(view.account), reason: accessText(view.reason) });
    case 'can-host': return t('online.account.signedInPlan', { account: accountText(view.account), plan: planText(view.access) });
    default: return t('online.account.signInFirst');
  }
}

/**
 * Online play's account section: what the account may host or why it may not, and the way to the account page, where
 * invite keys are redeemed and the account's data is exported and deleted. Signing in and out is the plugin's Atlas
 * account section's (`accountSettingsSection`), which online play shares with the Armarium.
 */
export function accountSections(account: AccountControl): AtlasSettingSection[] {
  return [{
    heading: t('online.account.heading'),
    rows: [{
      name: t('online.account.hosting'),
      desc: accountDesc(account.view()),
      // The row is drawn from the account as it is now and again whenever it changes, while the settings are open.
      render: (setting) => {
        const draw = (): void => {
          const view = account.view();
          setting.setDesc(accountDesc(view));
          setting.clear();
          addSettingButton(setting, {
            text: t('online.account.open'),
            variant: view.kind === 'no-access' ? 'default' : 'outline',
            onClick: () => account.openAccountPage(),
          });
        };
        draw();
        void account.refresh();
        return account.onChange(draw);
      },
    }],
  }];
}
