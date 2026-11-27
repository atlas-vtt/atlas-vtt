import React, { useMemo, useRef } from 'react';
import { motion, useIsPresent, type Variants } from 'framer-motion';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import type { AccountApi } from '../../gm/account/AccountControl.ts';
import { AccountSignIn } from '../../gm/account/AccountSignIn';
import { signInActions, signInPrompt } from '../../gm/account/signInPrompt.ts';
import { useAccountView } from '../../gm/account/useAccountView.ts';
import type { GmScreenSession, GmScreenView } from '../GmScreenSession.ts';
import { AllowPrompt } from './AllowPrompt';
import { DeviceList } from './DeviceList';
import { GmScreenQr } from './GmScreenQr';
import { LinkCopy } from './LinkCopy';
import { PanelActions } from './PanelActions';
import { escapeStack, PanelEscape } from './panelEscape.ts';
import { SidekickIcon } from './SidekickIcon';
import { useLightDismiss, type CloseReason } from './useLightDismiss.ts';

const NAME = t('gmScreen.name');

interface GmScreenPanelProps {
  readonly session: GmScreenSession;
  readonly view: GmScreenView;
  /** Online play's account: until it may host, the shared sign-in stands where Start would. */
  readonly account: AccountApi;
  readonly onClose: (reason: CloseReason) => void;
}

/** A leaving panel takes no press: it goes as a press would find it gone. */
const leaving = (variants: Variants): Variants => ({ ...variants, exit: { ...(variants.exit as object), pointerEvents: 'none' } });

/** While it is off: what Sidekick is, the shared sign-in until the account may host, then Start (and why it did not start or ended). */
function StoppedBody({ session, view, account }: Omit<GmScreenPanelProps, 'onClose'>): React.JSX.Element {
  const prompt = signInPrompt(useAccountView(account), { intro: null, unreachable: null });
  const actions = useMemo(() => signInActions(account), [account]);
  return (
    <>
      <div className="atlas-gm-screen-hero">
        <SidekickIcon className="atlas-gm-screen-hero__icon" />
        <p className="atlas-gm-screen-help atlas-gm-screen-hero__text">{t('gmScreen.intro', { name: NAME })}</p>
      </div>
      {prompt !== null && <AccountSignIn prompt={prompt} actions={actions} />}
      {prompt === null && view.problem !== null && <p className="atlas-sign-in__status atlas-online-tone--amber" role="status">{view.problem}</p>}
      {(prompt === null || prompt.startWaits) && (
        <Button type="button" className="atlas-gm-screen-start" disabled={prompt !== null || view.status === 'starting'} onClick={() => void session.start()}>
          {view.status === 'starting' ? t('gmScreen.starting', { name: NAME }) : t('gmScreen.start', { name: NAME })}
        </Button>
      )}
    </>
  );
}

/** While it runs: the code to scan and the link to copy, the devices, New link and Stop. */
function RunningBody({ session, view }: { session: GmScreenSession; view: GmScreenView }): React.JSX.Element {
  return (
    <>
      {view.link !== null && (
        <>
          <div className="atlas-gm-screen-code" data-status={view.status}>
            <GmScreenQr link={view.link} />
            <p className="atlas-gm-screen-caption">{view.status === 'online' ? t('gmScreen.scan') : t('gmScreen.connecting')}</p>
          </div>
          <LinkCopy key={view.link} link={view.link} />
        </>
      )}
      <DeviceList devices={view.devices} remove={(id) => session.remove(id)} />
      <PanelActions devices={view.devices.length} newLink={() => session.newLink()} stop={() => session.stop()} />
    </>
  );
}

/**
 * Sidekick's panel on the DM screen, a light popover under its control: a press outside or Escape closes
 * it before anything else hears of it. A device that asks to join comes first, whatever else it shows.
 */
export function GmScreenPanel({ session, view, account, onClose }: GmScreenPanelProps): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const escapes = useMemo(() => escapeStack(), []);
  const variants = leaving(useAnchoredPopoverVariants());
  useLightDismiss(root, useIsPresent(), () => escapes.undo(), onClose);
  const running = view.status === 'connecting' || view.status === 'online';
  return (
    <PanelEscape.Provider value={escapes}>
      <motion.div ref={root} className="atlas-gm-screen-panel" role="dialog" aria-label={NAME} variants={variants} initial="hidden" animate="visible" exit="exit">
        <header className="atlas-gm-screen-panel__header">
          <h2 className="atlas-gm-screen-panel__title">
            <SidekickIcon className="atlas-gm-screen-panel__icon" />
            {NAME}
          </h2>
          <CloseButton onClick={() => onClose('close')} />
        </header>
        <div className="atlas-gm-screen-panel__body">
          {view.knock !== null && <AllowPrompt knock={view.knock} waiting={view.waiting} allow={(id) => session.allow(id)} refuse={(id) => session.refuse(id)} />}
          {running ? <RunningBody session={session} view={view} /> : <StoppedBody session={session} view={view} account={account} />}
          {!running && view.devices.length > 0 && <DeviceList devices={view.devices} remove={(id) => session.remove(id)} />}
        </div>
      </motion.div>
    </PanelEscape.Provider>
  );
}
