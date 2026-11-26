import React from 'react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import type { Knock } from '../gmScreenKnocks.ts';

const NAME = t('gmScreen.name');

interface AllowPromptProps {
  readonly knock: Knock;
  /** Devices that wait, this one included. */
  readonly waiting: number;
  readonly allow: (id: string) => void;
  readonly refuse: (id: string) => void;
}

/**
 * Asks the GM about one device at a time: its name and the number it shows too. The buttons take no
 * press until the prompt has stood a moment with its number (`Knock.armed`).
 */
export function AllowPrompt({ knock, waiting, allow, refuse }: AllowPromptProps): React.JSX.Element {
  const ready = knock.armed && knock.check !== null;
  return (
    <section className="atlas-gm-screen-allow" role="alertdialog" aria-labelledby="atlas-gm-screen-allow-title" aria-describedby="atlas-gm-screen-allow-body">
      <h3 id="atlas-gm-screen-allow-title" className="atlas-gm-screen-allow__title">{t('gmScreen.allowTitle')}</h3>
      <p id="atlas-gm-screen-allow-body" className="atlas-gm-screen-allow__body">{t('gmScreen.allowBody', { device: knock.name, name: NAME })}</p>
      <output className="atlas-gm-screen-allow__check" aria-live="polite">{knock.check ?? '····'}</output>
      <div className="atlas-gm-screen-allow__actions">
        <Button variant="secondary" disabled={!ready} onClick={() => refuse(knock.id)}>{t('gmScreen.refuse')}</Button>
        <Button disabled={!ready} onClick={() => allow(knock.id)}>{t('gmScreen.allow')}</Button>
      </div>
      {waiting > 1 && <p className="atlas-gm-screen-allow__more">{t('gmScreen.moreWaiting', { count: waiting - 1 })}</p>}
    </section>
  );
}
