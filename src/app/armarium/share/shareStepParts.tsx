import React from 'react';
import type { App } from 'obsidian';
import type { AccountState, AtlasAccount } from '../../account/AtlasAccount';
import { Button } from '../../packages/components/primitives/button';
import { formatFileSize } from '../../utils/fileSize';
import { t } from '../../i18n';
import { ArmariumHosts } from '../armariumHosts';
import { armariumListingUrl } from '../armariumUrls';
import type { ShareSession } from '../upload/ShareSession';
import type { ShareSnapshot } from '../upload/shareState';
import { ACCOUNT_PAGE_REFUSALS } from '../upload/uploadContract';
import { AccountStep } from './steps/AccountStep';
import { ChecksStep } from './steps/ChecksStep';
import { DoneStep } from './steps/DoneStep';
import { ListingStep } from './steps/ListingStep';
import { PublishStep } from './steps/PublishStep';
import { UploadStep } from './steps/UploadStep';

export interface StepParts {
  title: string;
  body: React.ReactNode;
  actions: React.ReactNode;
  summary?: string | undefined;
}

interface PartsInput {
  app: App;
  session: ShareSession;
  snapshot: ShareSnapshot;
  account: AtlasAccount;
  accountState: AccountState;
  onClose: () => void;
}

const action = (label: string, onClick: () => void, primary = false, disabled = false): React.JSX.Element => (
  <Button key={label} variant={primary ? 'default' : 'outline'} className={primary ? 'atlas-transfer-confirm' : undefined} disabled={disabled} onClick={onClick}>{label}</Button>
);

function accountActions(account: AtlasAccount, state: AccountState, snapshot: ShareSnapshot, session: ShareSession): React.ReactNode {
  if (state.kind === 'signed-out') return action(t('account.signIn'), () => void account.signIn(), true);
  if (state.kind === 'waiting') return [action(t('account.openAgain'), () => account.reopenSignIn()), action(t('common.cancel'), () => account.cancelSignIn())];
  const refusal = snapshot.gate?.status === 'refused' ? snapshot.gate.refusal : null;
  if (refusal === null) return null;
  return [
    ...(ACCOUNT_PAGE_REFUSALS.includes(refusal.code) ? [action(t('account.openPage'), () => account.openAccountPage())] : []),
    action(t('armariumShare.checkAgain'), () => session.recheck(), true),
  ];
}

/** A step whose request found the GM signed out offers the sign-in before trying again. */
function withSignIn(snapshot: ShareSnapshot, account: AtlasAccount, actions: React.ReactNode): React.ReactNode {
  if (snapshot.refusal?.code !== 'signed-out' || account.token() !== null) return actions;
  return action(t('account.signIn'), () => void account.signIn(), true);
}

/** A check that refused or failed starts over; an ask that stopped is asked again. */
function checksActions({ submission, refusal, busy }: ShareSnapshot, session: ShareSession): React.ReactNode {
  if (submission?.state === 'rejected' || submission?.state === 'failed') return action(t('armariumShare.startOver'), () => session.startOver(), true);
  if (refusal !== null && !busy) return action(t('armariumShare.askAgain'), () => session.askAgain(), true);
  return null;
}

/** The open step's title, content and actions; the dialog lays them out. */
export function shareStepParts({ app, session, snapshot, account, accountState, onClose }: PartsInput): StepParts {
  const { step, busy, refusal, bundle } = snapshot;
  switch (step) {
    case 'account':
    case 'bundle':
      return { title: t('armariumShare.title.account'), body: <AccountStep state={accountState} gate={snapshot.gate} />, actions: accountActions(account, accountState, snapshot, session) };
    case 'upload':
      return {
        title: t('armariumShare.title.upload'),
        body: <UploadStep snapshot={snapshot} />,
        actions: withSignIn(snapshot, account, refusal !== null && !busy ? action(t('armariumShare.retry'), () => session.retryUpload(), true) : null),
        summary: bundle === null ? undefined : formatFileSize(bundle.bytes),
      };
    case 'checks':
      return {
        title: t('armariumShare.title.checks'),
        body: <ChecksStep snapshot={snapshot} />,
        actions: withSignIn(snapshot, account, checksActions(snapshot, session)),
      };
    case 'listing':
      return {
        title: t('armariumShare.title.listing'),
        body: <ListingStep snapshot={snapshot} session={session} />,
        actions: action(t('armariumShare.continue'), () => session.continueToPublish(), true),
      };
    case 'publish':
      return {
        title: t('armariumShare.title.publish'),
        body: <PublishStep snapshot={snapshot} session={session} account={account} />,
        actions: withSignIn(snapshot, account, [
          action(t('common.back'), () => session.backToListing(), false, busy),
          action(busy ? t('armariumShare.publishing') : t('armariumShare.publish'), () => void session.publish(), true, busy),
        ]),
      };
    case 'done': {
      const slug = snapshot.published?.slug ?? null;
      return {
        title: t('armariumShare.title.done'),
        body: <DoneStep snapshot={snapshot} />,
        actions: [
          action(t('common.close'), onClose),
          ...(slug === null || snapshot.published?.held === true ? [] : [action(t('armariumShare.openListing'), () => {
            onClose();
            ArmariumHosts.forApp(app).current()?.show(armariumListingUrl(slug));
          }, true)]),
        ],
      };
    }
  }
}
