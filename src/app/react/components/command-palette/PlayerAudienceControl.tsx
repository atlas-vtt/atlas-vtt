import React, { useEffect, useRef, useState } from 'react';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { PLAYER_AUDIENCES, type PlayerAudience } from '../../../resources/playerAudience';
import { t } from '../../../i18n';
import './player-audience-control.scss';

/** Each audience's short name and the sentence its tooltip says. */
const AUDIENCE_TEXT: Readonly<Record<PlayerAudience, { label: string; hint: string }>> = {
  hidden: { label: t('resource.audience.hidden'), hint: t('resource.audience.hiddenHint') },
  party: { label: t('resource.audience.party'), hint: t('resource.audience.partyHint') },
  opponents: { label: t('resource.audience.opponents'), hint: t('resource.audience.opponentsHint') },
  everyone: { label: t('resource.audience.everyone'), hint: t('resource.audience.everyoneHint') },
};

const OPTIONS: readonly SegmentedOption<PlayerAudience>[] = PLAYER_AUDIENCES.map((audience) => ({ value: audience, ...AUDIENCE_TEXT[audience] }));

/** How long a control whose save failed stays marked, in ms. */
const REFUSED_MS = 2000;

/** The sentence that says whose tokens players see a resource on. */
export function audienceHint(audience: PlayerAudience): string {
  return AUDIENCE_TEXT[audience].hint;
}

interface PlayerAudienceControlProps {
  /** The resource's name, for assistive technology. */
  name: string;
  audience: PlayerAudience;
  /** Saves the choice; a rejection puts the control back on the saved audience. */
  onChange: (audience: PlayerAudience) => Promise<void>;
  /** A selector of the surface the control stands in, so its tooltips never cover its other controls. */
  tooltipOutside?: string;
}

/**
 * Whose tokens players see one resource on: none, the party's, everyone else's or all, as one radio group.
 * A choice shows at once, while the collection is saved; the saved audience takes over once it arrives,
 * and a save that fails puts the control back on it.
 */
export function PlayerAudienceControl({ name, audience, onChange, tooltipOutside }: PlayerAudienceControlProps): React.ReactElement {
  const [shown, setShown] = useState(audience);
  // A save that failed marks the control itself for a moment, beside the notice at the window's edge
  const [refused, setRefused] = useState(false);
  const refusal = useRef<number | undefined>(undefined);
  const [saved, setSaved] = useState(audience);
  if (saved !== audience) {
    setSaved(audience);
    setShown(audience);
  }
  useEffect(() => () => window.clearTimeout(refusal.current), []);
  const choose = (next: PlayerAudience): void => {
    setShown(next);
    onChange(next).catch(() => {
      setShown(audience);
      setRefused(true);
      window.clearTimeout(refusal.current);
      refusal.current = window.setTimeout(() => setRefused(false), REFUSED_MS);
    });
  };
  // The selection is drawn once under the options and glides to the chosen one
  const at = { '--atlas-audience-at': PLAYER_AUDIENCES.indexOf(shown) } as React.CSSProperties;
  return (
    <div className={refused ? 'atlas-audience atlas-audience--refused' : 'atlas-audience'} style={at}>
      <SegmentedControl
        className="atlas-audience-control"
        value={shown}
        options={OPTIONS}
        onChange={choose}
        ariaLabel={t('resource.audience.label', { name })}
        roving
        {...(tooltipOutside && { tooltipOutside })}
      />
    </div>
  );
}
