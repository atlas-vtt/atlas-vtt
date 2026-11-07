import type { AtlasSettingSection } from '../../../settings/settingSections';
import type { AccountControl } from './AccountControl.ts';
import { accessText, accountText, planText, UNREACHABLE_TEXT, type AccountView } from './accountView.ts';
import { t } from '../../../i18n';

/** What the account row says. */
function accountDesc(view: AccountView): string {
  switch (view.kind) {
    case 'waiting': return t('online.account.approve');
    case 'checking': return t('online.account.checking');
    case 'unreachable': return UNREACHABLE_TEXT;
    case 'no-access': return t('online.account.signedInNoAccess', { account: accountText(view.account), reason: accessText(view.reason) });
    case 'can-host': return t('online.account.signedInPlan', { account: accountText(view.account), plan: planText(view.access) });
    default: return t('online.account.signedOut');
  }
}

const signedIn = (view: AccountView): boolean => view.kind === 'no-access' || view.kind === 'can-host' || view.kind === 'unreachable' || view.kind === 'checking';

/**
 * The settings' Account section: who is signed in, what the account may host or why it may not, and
 * the way to the account page, where invite keys are redeemed and the account's data is exported and deleted.
 */
export function accountSections(account: AccountControl): AtlasSettingSection[] {
  return [{
    heading: t('online.account.heading'),
    rows: [{
      name: t('online.account.name'),
      desc: accountDesc(account.view()),
      // The row is drawn from the account as it is now and again whenever it changes, while the settings are open.
      render: (setting) => {
        const draw = (): void => {
          const view = account.view();
          setting.setDesc(accountDesc(view));
          setting.clear();
          if (signedIn(view)) setting.addButton((button) => button.setButtonText(t('online.signOut')).onClick(() => void account.signOut()));
          else if (view.kind === 'signed-out') setting.addButton((button) => button.setButtonText(t('online.signIn')).setCta().onClick(() => void account.signIn()));
          else if (view.kind === 'waiting') setting.addButton((button) => button.setButtonText(t('online.cancel')).onClick(() => account.cancelSignIn()));
          setting.addButton((button) => {
            button.setButtonText(t('online.account.open')).onClick(() => account.openAccountPage());
            if (view.kind === 'no-access') button.setCta();
          });
        };
        draw();
        return account.onChange(draw);
      },
    }],
  }];
}
