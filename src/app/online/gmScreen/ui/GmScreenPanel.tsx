import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import type { AccountApi } from '../../gm/account/AccountControl.ts';
import { AccountSignIn } from '../../gm/account/AccountSignIn';
import { signInActions, signInPrompt } from '../../gm/account/signInPrompt.ts';
import { useAccountView } from '../../gm/account/useAccountView.ts';
import { COPIED_MS } from '../../gm/dock/controls.ts';
import { copyText } from '../../gm/dock/dockDom.ts';
import type { GmScreenSession, GmScreenView } from '../GmScreenSession.ts';
import { AllowPrompt } from './AllowPrompt';
import { DeviceList } from './DeviceList';
import { GmScreenQr } from './GmScreenQr';

const NAME = t('gmScreen.name');

interface GmScreenPanelProps {
  readonly session: GmScreenSession;
  readonly view: GmScreenView;
  /** Online play's account: until it may host, the shared sign-in stands where Start would. */
  readonly account: AccountApi;
  readonly onClose: () => void;
}

/** The link to copy, with a moment of "copied" after a press. */
function LinkRow({ link }: { link: string }): React.JSX.Element {
  const row = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = (): void => {
    if (row.current !== null) void copyText(row.current, link).then(setCopied);
  };
  return (
    <div className="atlas-gm-screen-link" ref={row}>
      <input className="atlas-gm-screen-link__field" readOnly value={link} aria-label={t('gmScreen.link', { name: NAME })} onFocus={(event) => event.currentTarget.select()} />
      <Button variant="secondary" onClick={copy}>{copied ? t('gmScreen.linkCopied') : t('gmScreen.copyLink')}</Button>
    </div>
  );
}

/**
 * The GM screen's panel on the DM screen. While it is off: the shared sign-in until the account may host, then
 * Start (and why it did not start or ended). While it runs: the QR code and the link, the devices, New link and
 * Stop; a device that asks to join comes first.
 */
export function GmScreenPanel({ session, view, account, onClose }: GmScreenPanelProps): React.JSX.Element {
  const running = view.status === 'connecting' || view.status === 'online';
  const prompt = signInPrompt(useAccountView(account), { intro: null, unreachable: null });
  const actions = useMemo(() => signInActions(account), [account]);
  return (
    <div
      className="atlas-gm-screen-panel"
      role="dialog"
      aria-label={NAME}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="atlas-gm-screen-panel__header">
        <h2 className="atlas-gm-screen-panel__title">{NAME}</h2>
        <CloseButton onClick={onClose} />
      </header>
      <div className="atlas-gm-screen-panel__body">
        {view.knock !== null && <AllowPrompt knock={view.knock} waiting={view.waiting} allow={(id) => session.allow(id)} refuse={(id) => session.refuse(id)} />}
        {!running && (
          <>
            <p className="atlas-gm-screen-help">{t('gmScreen.intro', { name: NAME })}</p>
            {prompt !== null && <AccountSignIn prompt={prompt} actions={actions} />}
            {prompt === null && view.problem !== null && <p className="atlas-gm-screen-problem" role="status">{view.problem}</p>}
            {(prompt === null || prompt.startWaits) && (
              <Button className="atlas-gm-screen-start" disabled={prompt !== null || view.status === 'starting'} onClick={() => void session.start()}>
                {view.status === 'starting' ? t('gmScreen.starting', { name: NAME }) : t('gmScreen.start', { name: NAME })}
              </Button>
            )}
          </>
        )}
        {running && view.link !== null && (
          <>
            <GmScreenQr link={view.link} />
            <p className="atlas-gm-screen-help">{view.status === 'online' ? t('gmScreen.scan') : t('gmScreen.connecting')}</p>
            <LinkRow link={view.link} />
          </>
        )}
        {(running || view.devices.length > 0) && <DeviceList devices={view.devices} remove={(id) => session.remove(id)} />}
        {running && (
          <div className="atlas-gm-screen-panel__actions">
            <Button variant="secondary" onClick={() => session.newLink()}>{t('gmScreen.newLink')}</Button>
            <Button variant="destructive" onClick={() => session.stop()}>{t('gmScreen.stop', { name: NAME })}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
