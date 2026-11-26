import type { AtlasSettingSection } from '../settings/settingSections';
import { t } from '../i18n';
import { addSettingButton } from '../ui/atlasButton';
import type { AccountState, AtlasAccount, SignInNotice } from './AtlasAccount';
import { identityText } from './accountIdentity';
import { SECRET_STORAGE_VERSION } from './tokenStore';

/** The line under the sign-in button that says how the last sign-in ended. */
export function signInNoticeText(notice: SignInNotice): string | null {
  switch (notice) {
    case 'timed-out': return t('account.timedOut');
    case 'declined': return t('account.declined');
    case 'server': return t('account.serverSignedOut');
    case 'unreachable': return t('account.unreachable');
    default: return null;
  }
}

/** What the account row says of the account as it is now. */
export function accountStateText(state: AccountState): string {
  switch (state.kind) {
    case 'unavailable': return t('account.unavailable', { version: SECRET_STORAGE_VERSION });
    case 'waiting': return state.userCode === null ? t('account.opening') : t('account.approve', { code: state.userCode });
    case 'signed-in':
      if (state.who === 'checking') return t('account.checking');
      if (state.who === 'unreachable') return t('account.signedInUnreachable');
      return t('account.signedInAs', { account: identityText(state.who) });
    case 'signed-out': {
      const notice = signInNoticeText(state.notice);
      return notice === null ? t('account.signedOut') : t('account.signedOutWithNotice', { notice });
    }
  }
}

/**
 * The settings' Atlas account section: who is signed in, sign in and out, and the way to the account page. The
 * account is optional; online play and the Armarium say what they use it for where they ask for it.
 */
export function accountSettingsSection(account: AtlasAccount): AtlasSettingSection {
  return {
    heading: t('account.heading'),
    rows: [{
      name: t('account.name'),
      desc: accountStateText(account.state()),
      aliases: ['account', 'sign in', 'sign out', 'login', 'Armarium', 'online'],
      // Drawn from the account as it is now and again whenever it changes, while the settings are open.
      render: (setting) => {
        const draw = (): void => {
          const state = account.state();
          setting.setDesc(accountStateText(state));
          setting.clear();
          if (state.kind === 'signed-in') addSettingButton(setting, { text: t('account.signOut'), onClick: () => void account.signOut() });
          else if (state.kind === 'signed-out') addSettingButton(setting, { text: t('account.signIn'), variant: 'default', onClick: () => void account.signIn() });
          else if (state.kind === 'waiting') {
            addSettingButton(setting, { text: t('account.openAgain'), onClick: () => account.reopenSignIn() });
            addSettingButton(setting, { text: t('common.cancel'), onClick: () => account.cancelSignIn() });
          }
          if (state.kind !== 'unavailable') addSettingButton(setting, { text: t('account.openPage'), variant: 'outline', onClick: () => account.openAccountPage() });
        };
        draw();
        void account.refresh();
        return account.onChange(draw);
      },
    }],
  };
}
