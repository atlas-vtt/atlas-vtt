import { t } from '../../../i18n';
import type { AccountApi } from './AccountControl.ts';
import { accessText, noticeText, UNREACHABLE_TEXT, type AccountView } from './accountView.ts';

/**
 * The sign-in every feature that needs Atlas Online shows (the online table's dock, Sidekick): what it says and
 * offers in each state of the account, decided once here and drawn by each surface in its own look.
 */

/** What the sign-in's buttons do: the account's own sign-in, the same wherever it is shown. */
export interface SignInActions {
  signIn(): void;
  cancelSignIn(): void;
  reopenSignIn(): void;
  signOut(): void;
  /** Asks the relay again (after it could not be reached). */
  retry(): void;
  /** Opens the account page of the website: invite keys are redeemed there, and it says what the account may host. */
  openAccountPage(): void;
}

export function signInActions(account: AccountApi): SignInActions {
  return {
    signIn: () => void account.signIn(),
    cancelSignIn: () => account.cancelSignIn(),
    reopenSignIn: () => account.reopenSignIn(),
    signOut: () => void account.signOut(),
    retry: () => void account.refresh(true),
    openAccountPage: () => account.openAccountPage(),
  };
}

export type SignInLine = { readonly text: string; readonly tone: 'help' | 'muted' | 'amber' | 'red' };

export interface SignInButton {
  readonly action: keyof SignInActions;
  readonly label: string;
  /** `cta` is the main action, `ghost` a quiet one beside it (Sign out). */
  readonly kind: 'cta' | 'plain' | 'ghost';
  readonly disabled: boolean;
}

/** The code the GM approves in the browser, as the approve page sets it, and as a screen reader says it. */
export interface ShownCode {
  readonly text: string;
  readonly label: string;
}

export interface SignInPrompt {
  readonly lines: readonly SignInLine[];
  readonly code: ShownCode | null;
  readonly buttons: readonly SignInButton[];
  /** The feature's own start stands under it, disabled, while the account is checked. */
  readonly startWaits: boolean;
}

/** What a feature says where the sign-in stands in for it. */
export interface SignInWords {
  /** What the feature is, said to a GM who is signed out; null where the surface says it in every state. */
  readonly intro: string | null;
  /** What goes on while the server cannot be reached; null where nothing need be said. */
  readonly unreachable: string | null;
}

export const SIGN_IN_TO_HOST = t('online.account.signIn');

/** A code as the approve page shows it: two groups of four. */
export const shownCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

const button = (action: keyof SignInActions, label: string, kind: SignInButton['kind'] = 'plain', disabled = false): SignInButton => ({ action, label, kind, disabled });

const prompt = (lines: readonly SignInLine[], buttons: readonly SignInButton[], code: ShownCode | null = null, startWaits = false): SignInPrompt => ({ lines, code, buttons, startWaits });

/** What the sign-in shows for the account as it is now, or null once the account may host: the feature shows its own. */
export function signInPrompt(view: AccountView, words: SignInWords): SignInPrompt | null {
  switch (view.kind) {
    case 'signed-out': {
      const notice = noticeText(view.notice);
      const lines: SignInLine[] = words.intro === null ? [] : [{ text: words.intro, tone: 'help' }];
      if (notice !== null) lines.push({ text: notice, tone: view.notice === 'server' ? 'amber' : 'red' });
      return prompt(lines, [button('signIn', SIGN_IN_TO_HOST, 'cta')]);
    }
    case 'waiting': {
      const actions = [button('reopenSignIn', t('online.account.openAgain'), 'plain', view.userCode === null), button('cancelSignIn', t('online.cancel'))];
      if (view.userCode === null) return prompt([{ text: t('online.account.opening'), tone: 'amber' }], actions);
      const code = { text: shownCode(view.userCode), label: t('online.codeShown', { code: view.userCode.split('').join(' ') }) };
      return prompt([{ text: t('online.account.approveCode'), tone: 'help' }], actions, code);
    }
    case 'checking':
      return prompt([{ text: t('online.account.checking'), tone: 'muted' }], [], null, true);
    case 'unreachable': {
      const lines: SignInLine[] = [{ text: UNREACHABLE_TEXT, tone: 'red' }];
      if (words.unreachable !== null) lines.push({ text: words.unreachable, tone: 'help' });
      return prompt(lines, [button('retry', t('online.account.retry'))]);
    }
    case 'no-access':
      return prompt([{ text: accessText(view.reason), tone: 'help' }], [button('signOut', t('online.signOut'), 'ghost'), button('openAccountPage', t('online.account.open'), 'cta')]);
    case 'can-host':
      return null;
  }
}
