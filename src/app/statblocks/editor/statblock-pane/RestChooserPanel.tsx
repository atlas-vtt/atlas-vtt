import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { checkRest, type RestOffer, type RestRequest } from '../../../recovery/restOffer';
import type { PaneAllies } from './paneAllies';
import { RestChoiceStep, type RestStepContext } from './RestChoiceStep';
import { RestSpendRow } from './RestStepper';
import { draftRequest, emptyDraft, withSpend } from './restDraft';

export interface RestChooserPanelProps {
  offer: RestOffer;
  /** The resting character's name, the first choice wherever an action may be taken for another. */
  selfName: string;
  allies: PaneAllies;
  /** A rest is being taken: Rest waits. */
  busy: boolean;
  /** Where a select's list opens, outside the scrolling body. */
  layer: HTMLElement | null;
  onRest: (request: RestRequest) => void;
  /** Closes the panel; `refocus` gives focus back to its button. */
  onClose: (refocus: boolean) => void;
}

/**
 * What a recovery button with steps opens: the button's own Spend rules, then each step with its
 * actions to pick, and Rest, which only takes a choice the engine accepts (`checkRest`): every step
 * within its counts, every spend within what the character holds.
 */
export function RestChooserPanel({ offer, selfName, allies, busy, layer, onRest, onClose }: RestChooserPanelProps): React.JSX.Element {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(() => emptyDraft(offer));
  // A fresh offer (the character changed meanwhile) starts the choice again.
  const [shown, setShown] = useState(offer);
  if (shown !== offer) {
    setShown(offer);
    setDraft(emptyDraft(offer));
  }
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const request = draftRequest(offer, draft);
  const accepted = checkRest([offer], request, allies.ids) !== null;
  const context: RestStepContext = { draft, onChange: setDraft, selfName, allies: allies.list, layer };

  return (
    <div ref={panelRef} className="atlas-sb-rest-panel" role="dialog" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}>
      <div className="atlas-sb-rest-panel__header">
        <h3 id={titleId} className="atlas-sb-rest-panel__title">{offer.name}</h3>
        <CloseButton onClick={() => onClose(true)} />
      </div>
      <div className="atlas-sb-rest-panel__body">
        {offer.spends.length > 0 && (
          <div className="atlas-sb-rest-panel__spends">
            {offer.spends.map((spend, index) => (
              <RestSpendRow key={spend.rule} spend={spend} units={draft.spends[index] ?? 0}
                onChange={(units) => setDraft(withSpend(draft, offer, index, units))} />
            ))}
          </div>
        )}
        {offer.choices.map((choice, step) => <RestChoiceStep key={choice.id} context={context} step={step} choice={choice} />)}
      </div>
      <div className="atlas-sb-rest-panel__footer">
        <Button type="button" variant="ghost" size="sm" onClick={() => onClose(true)}>{t('rest.cancel')}</Button>
        <Button type="button" size="sm" className="atlas-sb-rest-panel__rest" disabled={!accepted || busy} onClick={() => onRest(request)}>
          {t('rest.take')}
        </Button>
      </div>
    </div>
  );
}
